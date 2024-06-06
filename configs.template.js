module.exports = {
  pdfPreview: {
    maxGetPageScale: 0.5,
    maxGetPageCount: 8
  },
  ffmpeg: {
    encoder: 'libx264', // NVIDIA: h264_nvenc, AMD: h264_amf, 软解: libx264
  },
  communication: {
    serverAddress: '127.0.0.1',
    serverPort: 8976,
    clientName: 'media',
    nkcName: 'nkc',
  },
  address: '127.0.0.1',
  port: 10283,

  moleculer: {
    namespace: "NKC_MESH_PRODUCTION",
    nodeID: "nkc_media",
    transporter: "redis://127.0.0.1:6379",
    registry: {
      strategy: "Random",
      discoverer: "Local"
    },
    web: {
      enabled: true,
      port: 20396,
      host: "127.0.0.1"
    }
  },
  maxConcurrentVCount: 5
};
