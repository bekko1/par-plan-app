/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 楽天GORAのコース画像等を<Image>で扱う場合はここにremotePatternsを追加する
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
