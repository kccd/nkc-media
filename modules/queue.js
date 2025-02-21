const fileProcessor = require("../services/fileProcessor");
const queueConfig = require('../configs.js').queue;

const {KoaAdapter} = require("@bull-board/koa");
const {createBullBoard} = require("@bull-board/api");
const { BullAdapter } = require('@bull-board/api/bullAdapter');

const Bull = require("bull");
const redisUrl = require('../configs.js').moleculer.transporter
class QueueModule {
  pictureQueue = this.newQueue('picture');
  audioQueue = this.newQueue('audio');
  videoQueue = this.newQueue('video');
  attachmentQueue = this.newQueue('attachment');
  constructor() {
    const handle = async (job) => {
      const {
        type,
        file,
        cover,
        data,
        storeUrl
      } = job.data;
      await fileProcessor[type]({
        file,
        cover,
        data,
        storeUrl,
      });
    }
    this.pictureQueue.process(queueConfig.picture, handle).catch(console.error);
    this.audioQueue.process(queueConfig.audio, handle).catch(console.error);
    this.videoQueue.process(queueConfig.video, handle).catch(console.error);
    this.attachmentQueue.process(queueConfig.attachment, handle).catch(console.error);
  }

  newQueue(type) {
    return new Bull(
      `queue-${type}`,
      redisUrl, // 直接传递连接字符串
      {
        settings: {
          lockDuration: 30000,
          maxStalledCount: 1,
          retryProcessDelay: 5000,
        },
        limiter: {
          max: 1000,
          duration: 5000,
        },
      }
    )
  }

  initBullBoard(app) {
    // 创建可视化面板实例
    const serverAdapter = new KoaAdapter();

    createBullBoard({
      queues: [
        this.pictureQueue,
        this.audioQueue,
        this.videoQueue,
        this.attachmentQueue,
      ].map(q => new BullAdapter(q)),
      serverAdapter: serverAdapter,
    });

    // 注册管理界面路由
    serverAdapter.setBasePath('/admin/queues');
    app.use(serverAdapter.registerPlugin());
  }
}

module.exports = {
  queueModule: new QueueModule(),
}
