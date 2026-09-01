import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://closepilot-delta.vercel.app";
  return [
    { url: base, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/guide`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
