import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./markdown.module.scss";

export default function MarkdownContent({ children }: { children: string }) {
  return (
    <div className={styles.content}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        urlTransform={(url, key) => {
          const protocols =
            key === "src" ? ["https:", "http:"] : ["https:", "http:", "mailto:"];
          try {
            return protocols.includes(new URL(url).protocol) ? url : "";
          } catch {
            return "";
          }
        }}
        components={{
          a: ({ children, href }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ src, alt }) =>
            src ? (
              <img
                src={src}
                alt={alt || ""}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span>{alt}</span>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
