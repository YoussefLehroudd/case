/** @type {import('next').NextConfig} */
const uploadthingAppId = process.env.UPLOADTHING_APP_ID?.replaceAll("'", '')
const uploadthingHost = uploadthingAppId
  ? `${uploadthingAppId}.ufs.sh`
  : undefined

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'utfs.io',
        pathname: '/**',
      },
      ...(uploadthingHost
        ? [
            {
              protocol: 'https',
              hostname: uploadthingHost,
              pathname: '/**',
            },
          ]
        : []),
    ],
  },
}

export default nextConfig
