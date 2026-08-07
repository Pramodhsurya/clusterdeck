import type { Config } from "@docusaurus/types";
import rehypeHighlight from "rehype-highlight";

const baseUrl = process.env.EMBEDDED ? "/docsite/" : "/";

const config: Config = {
    title: "Clusterdeck Documentation",
    tagline: "macOS-first multi-cluster SSH workspaces",
    favicon: "img/logo/clusterdeck-256.png",
    url: "https://docs.clusterdeck.app",
    baseUrl,
    organizationName: "clusterdeck",
    projectName: "app",
    deploymentBranch: "gh-pages",
    onBrokenAnchors: "throw",
    onBrokenLinks: "throw",
    trailingSlash: false,
    markdown: {
        hooks: {
            onBrokenMarkdownLinks: "throw",
        },
    },
    i18n: {
        defaultLocale: "en",
        locales: ["en"],
    },
    plugins: [
        [
            "content-docs",
            {
                path: "docs",
                routeBasePath: "/",
                editUrl: !process.env.EMBEDDED ? "https://github.com/clusterdeck/app/edit/main/docs/" : undefined,
                rehypePlugins: [rehypeHighlight],
            } as import("@docusaurus/plugin-content-docs").Options,
        ],
        "ideal-image",
        [
            "@docusaurus/plugin-sitemap",
            {
                changefreq: "weekly",
                filename: "sitemap.xml",
            },
        ],
        "docusaurus-plugin-sass",
        "@docusaurus/plugin-svgr",
    ],
    themes: [["classic", { customCss: "src/css/custom.scss" }]],
    themeConfig: {
        docs: {
            sidebar: {
                hideable: false,
                autoCollapseCategories: false,
            },
        },
        colorMode: {
            defaultMode: "light",
            disableSwitch: false,
            respectPrefersColorScheme: true,
        },
        navbar: {
            logo: {
                alt: "Clusterdeck",
                src: "img/logo/clusterdeck-logo.png",
                srcDark: "img/logo/clusterdeck-logo.png",
                href: "/",
            },
            hideOnScroll: true,
            items: [
                {
                    type: "doc",
                    position: "left",
                    docId: "index",
                    label: "Docs",
                },
                !process.env.EMBEDDED
                    ? {
                          href: "https://github.com/clusterdeck/app",
                          position: "right",
                          className: "header-link-custom custom-icon-github",
                          "aria-label": "Clusterdeck GitHub repository",
                      }
                    : undefined,
            ].filter(Boolean),
        },
        metadata: [
            {
                name: "keywords",
                content: "Clusterdeck, macOS, terminal, SSH, workspace, explorer, editor, durable sessions, wsh",
            },
            { name: "og:type", content: "website" },
            { name: "og:site_name", content: "Clusterdeck Documentation" },
            { name: "application-name", content: "Clusterdeck Documentation" },
            { name: "apple-mobile-web-app-title", content: "Clusterdeck Documentation" },
        ],
        footer: {
            copyright: `Copyright © ${new Date().getFullYear()} Clusterdeck Authors. Clusterdeck is derived from Wave Terminal by Command Line Inc.`,
        },
    },
    headTags: [
        {
            tagName: "link",
            attributes: {
                rel: "preload",
                as: "font",
                type: "font/woff2",
                "data-next-font": "size-adjust",
                href: `${baseUrl}fontawesome/webfonts/fa-sharp-regular-400.woff2`,
            },
        },
        {
            tagName: "link",
            attributes: {
                rel: "preload",
                as: "font",
                type: "font/woff2",
                "data-next-font": "size-adjust",
                href: `${baseUrl}fontawesome/webfonts/fa-sharp-solid-900.woff2`,
            },
        },
        {
            tagName: "link",
            attributes: {
                rel: "sitemap",
                type: "application/xml",
                title: "Sitemap",
                href: `${baseUrl}sitemap.xml`,
            },
        },
    ],
    stylesheets: [
        `${baseUrl}fontawesome/css/fontawesome.min.css`,
        `${baseUrl}fontawesome/css/sharp-regular.min.css`,
        `${baseUrl}fontawesome/css/sharp-solid.min.css`,
    ],
    staticDirectories: ["static"],
};

export default config;
