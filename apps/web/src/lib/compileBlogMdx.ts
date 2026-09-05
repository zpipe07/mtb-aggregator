import { compileMDX } from "next-mdx-remote/rsc";
import { blogMdxComponents } from "@/components/blog/mdx-components";

/** Compile a trusted in-repo MDX body. Posts are git-reviewed, never user-submitted. */
export async function compileBlogMdx(source: string) {
  const { content } = await compileMDX({
    source,
    components: blogMdxComponents,
    options: {
      parseFrontmatter: false,
    },
  });
  return content;
}
