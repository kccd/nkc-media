const {queueModule} = require("../modules/queue");
module.exports = async (ctx, next) => {
  const {body} = ctx;
  const {files, fields} = body;
  const {file, cover} = files;
  const {type, storeUrl} = fields;
  const data = JSON.parse(fields.data);

  const jobData = {
    type,
    file,
    cover,
    data,
    storeUrl
  };

  let job;

  switch(type) {
    case 'mediaPicture':
    case 'identityPictureA':
    case 'identityPictureB':
    case 'attachment':
    case 'messageImage': {
      job = await queueModule.pictureQueue.add(jobData);
      break;
    }

    case 'mediaAudio':
    case 'messageVoice':
    case 'messageAudio': {
      job = await queueModule.audioQueue.add(jobData);
      break;
    }

    case 'mediaVideo':
    case 'messageVideo':
    case 'identityVideo': {
      job = await queueModule.videoQueue.add(jobData);
      break;
    }

    case 'mediaAttachment':
    case 'messageFile': {
      job = await queueModule.attachmentQueue.add(jobData);
      break;
    }
    default: {
      throw new Error(`Unsupported media type ${type}`);
    }
  }

  if(job) {
    ctx.data.files = await job.finished();
  }
  await next();
}
