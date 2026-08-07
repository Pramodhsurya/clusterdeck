// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package telemetry

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/wavetermdev/waveterm/pkg/panichandler"
	"github.com/wavetermdev/waveterm/pkg/telemetry/telemetrydata"
	"github.com/wavetermdev/waveterm/pkg/util/dbutil"
	"github.com/wavetermdev/waveterm/pkg/util/utilfn"
	"github.com/wavetermdev/waveterm/pkg/waveobj"
	"github.com/wavetermdev/waveterm/pkg/wconfig"
	"github.com/wavetermdev/waveterm/pkg/wshrpc"
	"github.com/wavetermdev/waveterm/pkg/wstore"
)

const MaxTzNameLen = 50
const ActivityEventName = "app:activity"
const WshRunEventName = "wsh:run"

var cachedTosAgreedTs atomic.Int64
var telemetryRecordingEnabled atomic.Bool

func GetTosAgreedTs() int64 {
	cached := cachedTosAgreedTs.Load()
	if cached != 0 {
		return cached
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	client, err := wstore.DBGetSingleton[*waveobj.Client](ctx)
	if err != nil || client == nil || client.TosAgreed == 0 {
		return 0
	}

	cachedTosAgreedTs.Store(client.TosAgreed)
	return client.TosAgreed
}

func IsTelemetryEnabled() bool {
	settings := wconfig.GetWatcher().GetFullConfig()
	return settings.Settings.TelemetryEnabled
}

func IsTelemetryRecordingEnabled() bool {
	return telemetryRecordingEnabled.Load()
}

func applyTelemetryConsent(enabled bool, purgeFn func() error) error {
	// Close recording before purging so a pre-consent event cannot race into the
	// queue while an opt-in transition is being applied.
	telemetryRecordingEnabled.Store(false)
	if err := purgeFn(); err != nil {
		return err
	}
	telemetryRecordingEnabled.Store(enabled)
	return nil
}

// ApplyTelemetryConsent deletes all unsent event rows and the obsolete legacy
// activity table before changing recording state. This makes opt-in
// non-retroactive and removes activity data collected by older builds.
func ApplyTelemetryConsent(ctx context.Context, enabled bool) error {
	return applyTelemetryConsent(enabled, func() error {
		return wstore.WithTx(ctx, func(tx *wstore.TxWrap) error {
			tx.Exec(`DELETE FROM db_tevent WHERE uploaded = 0`)
			tx.Exec(`DELETE FROM db_activity`)
			return nil
		})
	})
}

// Legacy activity aggregation is intentionally disabled. ActivityUpdate call
// sites remain as compatibility no-ops while the event telemetry path is in use.
func GoUpdateActivityWrap(update wshrpc.ActivityUpdate, debugStr string) {}

func UpdateActivity(ctx context.Context, update wshrpc.ActivityUpdate) error {
	return nil
}

func insertTEvent(ctx context.Context, event *telemetrydata.TEvent) error {
	if event.Uuid == "" {
		return fmt.Errorf("cannot insert TEvent: uuid is empty")
	}
	if event.Ts == 0 {
		return fmt.Errorf("cannot insert TEvent: ts is 0")
	}
	if event.TsLocal == "" {
		return fmt.Errorf("cannot insert TEvent: tslocal is empty")
	}
	if event.Event == "" {
		return fmt.Errorf("cannot insert TEvent: event is empty")
	}
	return wstore.WithTx(ctx, func(tx *wstore.TxWrap) error {
		query := `INSERT INTO db_tevent (uuid, ts, tslocal, event, props)
				  VALUES (?, ?, ?, ?, ?)`
		tx.Exec(query, event.Uuid, event.Ts, event.TsLocal, event.Event, dbutil.QuickJson(event.Props))
		return nil
	})
}

// merges newActivity into curActivity, returns curActivity
func mergeActivity(curActivity *telemetrydata.TEventProps, newActivity telemetrydata.TEventProps) {
	curActivity.ActiveMinutes += newActivity.ActiveMinutes
	curActivity.FgMinutes += newActivity.FgMinutes
	curActivity.OpenMinutes += newActivity.OpenMinutes
	curActivity.TermCommandsRun += newActivity.TermCommandsRun
	curActivity.TermCommandsRemote += newActivity.TermCommandsRemote
	curActivity.TermCommandsDurable += newActivity.TermCommandsDurable
	curActivity.TermCommandsWsl += newActivity.TermCommandsWsl
	if newActivity.AppFirstDay {
		curActivity.AppFirstDay = true
	}
}

// ignores the timestamp in tevent, and uses the current time
func updateActivityTEvent(ctx context.Context, tevent *telemetrydata.TEvent) error {
	eventTs := time.Now()
	// compute to 1-hour boundary, and round up to next 1-hour boundary
	eventTs = eventTs.Truncate(time.Hour).Add(time.Hour)

	return wstore.WithTx(ctx, func(tx *wstore.TxWrap) error {
		// find event that matches this timestamp with event name "app:activity"
		var hasRow bool
		var curActivity telemetrydata.TEventProps
		uuidStr := tx.GetString(`SELECT uuid FROM db_tevent WHERE ts = ? AND event = ?`, eventTs.UnixMilli(), ActivityEventName)
		if uuidStr != "" {
			hasRow = true
			rawProps := tx.GetString(`SELECT props FROM db_tevent WHERE uuid = ?`, uuidStr)
			err := json.Unmarshal([]byte(rawProps), &curActivity)
			if err != nil {
				// ignore, curActivity will just be 0
				log.Printf("error unmarshalling activity props: %v\n", err)
			}
		}
		mergeActivity(&curActivity, tevent.Props)

		if hasRow {
			query := `UPDATE db_tevent SET props = ? WHERE uuid = ?`
			tx.Exec(query, dbutil.QuickJson(curActivity), uuidStr)
		} else {
			query := `INSERT INTO db_tevent (uuid, ts, tslocal, event, props) VALUES (?, ?, ?, ?, ?)`
			tsLocal := utilfn.ConvertToWallClockPT(eventTs).Format(time.RFC3339)
			tx.Exec(query, uuid.New().String(), eventTs.UnixMilli(), tsLocal, ActivityEventName, dbutil.QuickJson(curActivity))
		}
		return nil
	})
}

// aggregates wsh:run events per (cmd, haderror) key within the current 1-hour bucket
func updateWshRunTEvent(ctx context.Context, tevent *telemetrydata.TEvent) error {
	eventTs := time.Now().Truncate(time.Hour).Add(time.Hour)
	incomingCount := tevent.Props.WshCount
	if incomingCount <= 0 {
		incomingCount = 1
	}
	return wstore.WithTx(ctx, func(tx *wstore.TxWrap) error {
		uuidStr := tx.GetString(
			`SELECT uuid FROM db_tevent WHERE ts = ? AND event = ? AND json_extract(props, '$."wsh:cmd"') IS ?`,
			eventTs.UnixMilli(), WshRunEventName, tevent.Props.WshCmd,
		)
		if uuidStr != "" {
			var curProps telemetrydata.TEventProps
			rawProps := tx.GetString(`SELECT props FROM db_tevent WHERE uuid = ?`, uuidStr)
			if rawProps != "" {
				if err := json.Unmarshal([]byte(rawProps), &curProps); err != nil {
					log.Printf("error unmarshalling wsh:run props: %v\n", err)
				}
			}
			curCount := curProps.WshCount
			if curCount <= 0 {
				curCount = 1
			}
			curProps.WshCount = curCount + incomingCount
			curProps.WshErrorCount += tevent.Props.WshErrorCount
			tx.Exec(`UPDATE db_tevent SET props = ? WHERE uuid = ?`, dbutil.QuickJson(curProps), uuidStr)
		} else {
			newProps := tevent.Props
			newProps.WshCount = incomingCount
			tsLocal := utilfn.ConvertToWallClockPT(eventTs).Format(time.RFC3339)
			tx.Exec(`INSERT INTO db_tevent (uuid, ts, tslocal, event, props) VALUES (?, ?, ?, ?, ?)`,
				uuid.New().String(), eventTs.UnixMilli(), tsLocal, WshRunEventName, dbutil.QuickJson(newProps))
		}
		return nil
	})
}

func TruncateActivityTEventForShutdown(ctx context.Context) error {
	if !IsTelemetryRecordingEnabled() {
		return nil
	}
	nowTs := time.Now()
	eventTs := nowTs.Truncate(time.Hour).Add(time.Hour)
	return wstore.WithTx(ctx, func(tx *wstore.TxWrap) error {
		// find event that matches this timestamp with event name "app:activity"
		uuidStr := tx.GetString(`SELECT uuid FROM db_tevent WHERE ts = ? AND event = ?`, eventTs.UnixMilli(), ActivityEventName)
		if uuidStr == "" {
			return nil
		}
		// we're going to update this app:activity event back to nowTs
		tsLocal := utilfn.ConvertToWallClockPT(nowTs).Format(time.RFC3339)
		query := `UPDATE db_tevent SET ts = ?, tslocal = ? WHERE uuid = ?`
		tx.Exec(query, nowTs.UnixMilli(), tsLocal, uuidStr)
		return nil
	})
}

func GoRecordTEventWrap(tevent *telemetrydata.TEvent) {
	if !IsTelemetryRecordingEnabled() || tevent == nil || tevent.Event == "" {
		return
	}
	go func() {
		defer func() {
			panichandler.PanicHandlerNoTelemetry("GoRecordTEventWrap", recover())
		}()
		ctx, cancelFn := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancelFn()
		err := RecordTEvent(ctx, tevent)
		if err != nil {
			// ignore error, just log, since this is not critical
			log.Printf("error recording %q telemetry event: %v\n", tevent.Event, err)
		}
	}()
}

func RecordTEvent(ctx context.Context, tevent *telemetrydata.TEvent) error {
	if !IsTelemetryRecordingEnabled() || tevent == nil {
		return nil
	}
	if tevent.Uuid == "" {
		tevent.Uuid = uuid.New().String()
	}
	err := tevent.Validate(true)
	if err != nil {
		return err
	}
	tevent.EnsureTimestamps()

	// Set AppFirstDay if on same calendar day as TOS agreement
	tosAgreedTs := GetTosAgreedTs()
	if tosAgreedTs == 0 {
		tevent.Props.AppFirstDay = true
	} else {
		tosYear, tosMonth, tosDay := time.UnixMilli(tosAgreedTs).Date()
		nowYear, nowMonth, nowDay := time.Now().Date()
		if tosYear == nowYear && tosMonth == nowMonth && tosDay == nowDay {
			tevent.Props.AppFirstDay = true
		}
	}

	if tevent.Event == ActivityEventName {
		return updateActivityTEvent(ctx, tevent)
	}
	if tevent.Event == WshRunEventName {
		return updateWshRunTEvent(ctx, tevent)
	}
	return insertTEvent(ctx, tevent)
}

func CleanOldTEvents(ctx context.Context) error {
	daysToKeep := 7
	if !IsTelemetryEnabled() {
		daysToKeep = 1
	}
	olderThan := time.Now().AddDate(0, 0, -daysToKeep).UnixMilli()
	return wstore.WithTx(ctx, func(tx *wstore.TxWrap) error {
		query := `DELETE FROM db_tevent WHERE ts < ?`
		tx.Exec(query, olderThan)
		return nil
	})
}

func GetNonUploadedTEvents(ctx context.Context, maxEvents int) ([]*telemetrydata.TEvent, error) {
	now := time.Now()
	return wstore.WithTxRtn(ctx, func(tx *wstore.TxWrap) ([]*telemetrydata.TEvent, error) {
		var rtn []*telemetrydata.TEvent
		query := `SELECT uuid, ts, tslocal, event, props, uploaded FROM db_tevent WHERE uploaded = 0 AND ts <= ? ORDER BY ts LIMIT ?`
		tx.Select(&rtn, query, now.UnixMilli(), maxEvents)
		for _, event := range rtn {
			if err := event.ConvertRawJSON(); err != nil {
				return nil, fmt.Errorf("scan json for event %s: %w", event.Uuid, err)
			}
		}
		return rtn, nil
	})
}

func MarkTEventsAsUploaded(ctx context.Context, events []*telemetrydata.TEvent) error {
	return wstore.WithTx(ctx, func(tx *wstore.TxWrap) error {
		ids := make([]string, 0, len(events))
		for _, event := range events {
			ids = append(ids, event.Uuid)
		}
		query := `UPDATE db_tevent SET uploaded = 1 WHERE uuid IN (SELECT value FROM json_each(?))`
		tx.Exec(query, dbutil.QuickJson(ids))
		return nil
	})
}
