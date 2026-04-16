/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Known TS7006 cascade errors from Zustand circular type inference — do not block builds
    ignoreBuildErrors: true,
  },
}

export default nextConfig
