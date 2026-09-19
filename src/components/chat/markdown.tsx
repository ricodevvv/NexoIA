"use client";

import { isValidElement, memo, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CodeBlock } from "./code-block";
import styles from "./chat.module.css";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

const components: Components = {
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    if (isValidElement(child)) {
      const el = child as ReactElement<{ className?: string; children?: ReactNode }>;
      const lang = /language-([\w+-]+)/.exec(el.props.className ?? "")?.[1] ?? "";
      return <CodeBlock code={textOf(el.props.children).replace(/\n$/, "")} lang={lang} />;
    }
    return <pre>{children}</pre>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className={styles.tableWrap}>
        <table>{children}</table>
      </div>
    );
  },
};

const remarkPlugins = [remarkGfm, [remarkMath, { singleDollarTextMath: true }]] as never[];
const rehypePlugins = [[rehypeKatex, { throwOnError: false, strict: "ignore" }]] as never[];

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className={styles.prose}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
