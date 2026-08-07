import type { WrapperProps } from "@docusaurus/types";
import Heading from "@theme-original/MDXComponents/Heading";

type Props = WrapperProps<typeof Heading>;

export default function HeadingWrapper(props: Props): JSX.Element {
    return (
        <>
            <div style={{ clear: "both" }} />
            <Heading {...props} />
        </>
    );
}
