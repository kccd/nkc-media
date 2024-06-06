const PATH = require('path')
const tools = require('../../tools')
const ff = require('fluent-ffmpeg')
const {sendMessageToNkc} = require('../../socket')
const {encoder} = require('../../configs').ffmpeg;

const {maxConcurrentVCount} = require('../../configs');
const maxConcurrent = maxConcurrentVCount || 5;
let pendingRequests = [];
let activeRequests = 0;
module.exports = async (props) => {
  // 将请求参数加入待处理队列
  pendingRequests.push({...props});
  // 如果当前处理数量未达到最大并发数,则立即处理请求
  if (activeRequests < maxConcurrent) {
    await processNextRequest();
  }
}
async function processNextRequest(){
  // 如果没有待处理请求,则直接返回
  if (pendingRequests.length === 0) return;

  // 从待处理队列中取出下一个请求
  const props = pendingRequests.shift();

  try {
    activeRequests++;
    // 调用视频上传方法
    await handleVideoUpload(props);
  } catch (error) {
    console.error('Error uploading video:', error);
  } finally {
    activeRequests--;
    // 尝试处理下一个待处理请求
    await processNextRequest();
  }
};
async function handleVideoUpload(props){
  const {
    cover,
    file,
    data,
    storeUrl
  } = props;
  const {
    waterGravity,
    mediaPath,
    timePath,
    videoSize,
    rid,
    toc,
    flex,
    waterAdd,
    transparency,
    configs,
    defaultBV,
    enabled,
    minWidth,
    minHeight
  } = data;
  const coverPath = cover? cover.path: '';
  const filePath = file.path;//临时目录
  const time = (new Date(toc)).getTime();

  const tempFilesPath = [filePath, coverPath];

  const func = async () => {
    const {width: videoWidth, height: videoHeight} = await tools.getFileInfo(filePath);
    const watermarkHeight = ~~Math.min(videoWidth, videoHeight) * (flex/100);
    const watermarkDisabled = (
      !cover ||
      videoWidth < minWidth ||
      videoHeight < minHeight ||
      !waterAdd ||
      !enabled
    );
    const videos = [];
    for(const type in videoSize) {
      const {
        height,
        fps,
      } = videoSize[type];
      if(type !== 'sd' && videoHeight < height) continue;
      const filename = `${rid}_${type}.mp4`;
      const localPath = `${filePath}_${type}.mp4`;
      videos.push({
        type,
        height,
        fps,
        filename,
        localPath,
        storePath: PATH.join(mediaPath, timePath, filename),
        bitrate: (await getBitrateBySize(height * videoWidth / videoHeight, height, configs, defaultBV)) + 'K',
      });
      tempFilesPath.push(localPath);
    }
    const outputs = videos.map(v => {
      const {height, fps, bitrate, localPath} = v;
      return {
        height,
        fps,
        bitrate,
        path: localPath
      }
    });

    const {x, y} = gravityToPositionMap[waterGravity];
    const props = {
      videoPath: filePath,
      watermark: {
        disabled: watermarkDisabled,
        path: coverPath,
        height: watermarkHeight,
        x,
        y,
        transparency
      },
      outputs
    };


    await videoProgress(props);

    const storeData = [];
    const filesInfo = {};
    for(const video of videos) {
      const {localPath, storePath, filename, type} = video;
      storeData.push({
        filePath: localPath,
        path: storePath,
        time,
      });
      const fileInfo = await tools.getFileInfo(localPath);
      fileInfo.name = filename;
      filesInfo[type] = fileInfo;
    }

    const coverType = 'cover';
    const videoCoverLocalPath = `${filePath}_${coverType}.jpg`;
    const videoCoverName = `${rid}_${coverType}.jpg`;
    const videoCoverStorePath = PATH.join(mediaPath, timePath, videoCoverName);
    tempFilesPath.push(videoCoverLocalPath);
    await videoFirstThumbTaker(filePath, videoCoverLocalPath);

    storeData.push({
      filePath: videoCoverLocalPath,
      path: videoCoverStorePath,
      time,
    });
    const fileInfo = await tools.getFileInfo(videoCoverLocalPath);
    fileInfo.name = videoCoverName;
    filesInfo[coverType] = fileInfo;

    await tools.storeClient(storeUrl, storeData);
    await sendMessageToNkc('resourceStatus', {
      rid,
      status: true,
      filesInfo
    });
  };

  await func()
    .catch((err) => {
      console.log(err);
      return sendMessageToNkc('resourceStatus', {
        rid,
        status: false,
        error: err.message || err.toString()
      });
    })
    .finally(() => {
      return Promise.all(tempFilesPath.map(filePath => {
        return tools.deleteFile(filePath);
      }));
    })
}

// 获取视频的第一帧图片
function videoFirstThumbTaker(videoPath,imgPath) {
  return tools.spawnProcess('ffmpeg',['-i',videoPath, '-ss', '1', '-vframes' ,'1', imgPath])
}

//获取视频的比特率
// @return 比特率 Kbps
function getBitrateBySize(width, height, configs, defaultBV) {
  const s =  width * height;
  let rate;
  for(const v of configs) {
    const {bv, from, to} = v;
    if(s >= from && s < to) {
      rate = bv;
      break
    }
  }
  if(!rate) {
    rate = defaultBV;
  }
  return rate * 1024;
}

async function videoProgress(props) {
  return new Promise(async (resolve, reject) => {
    const {
      videoPath,
      watermark,
      outputs
    } = props;

    const filterInputNames = [];
    const filterOutputNames = [];
    const filterModifyVideo = [];
    for(let i = 0; i < outputs.length; i ++) {
      const {
        height,
        fps,
      } = outputs[i];
      const inputName = `[video_${i}]`;
      const outputName = `[out_${i}]`;
      filterInputNames.push(inputName);
      filterOutputNames.push(outputName);
      filterModifyVideo.push(`${inputName}scale=-2:${height},fps=fps=${fps}${outputName}`);
    }

    const hasAudioStream = await tools.hasAudioStream(videoPath);
    const audioStream = hasAudioStream? ['-map', '0:a']: [];
    let task = ff();
    task.input(videoPath);
    task.inputOptions([
      '-y',
    ]);
    if(!watermark.disabled) {
      // 打水印
      task.input(watermark.path);
      task.complexFilter([
        `[1:v]scale=-2:${watermark.height},lut=a=val*${watermark.transparency}[watermark]`,
        `[0:v][watermark]overlay=${watermark.x}:${watermark.y},split=${filterInputNames.length}${filterInputNames.join('')}`,
        ...filterModifyVideo
      ]);
    } else {
      // 不大水印
      task.complexFilter([
        `split=${filterInputNames.length}${filterInputNames.join('')}`,
        ...filterModifyVideo
      ]);
    }
    for(let i = 0; i < outputs.length; i ++) {
      const outputName = filterOutputNames[i];
      const {path, bitrate} = outputs[i];
      task.output(path);
      task.outputOptions([
        '-map',
        outputName,
        ...audioStream,
        `-map_metadata`,
        `-1`,
        `-b:v`,
        bitrate,
        '-c:a',
        'copy',
        '-c:v',
        encoder,
      ]);
    }
    task.on('end', resolve);
    task.on('error', reject);
    task.run();
  });
}

// 方位和position参数的映射关系
const gravityToPositionMap = {
  southeast: {
    x: "W-w-10",
    y: "H-h-10"
  },
  northeast: {
    x: "W-w-10",
    y: "10"
  },
  southwest: {
    x: "10",
    y: "H-h-10"
  },
  northwest: {
    x: "10",
    y: "10"
  },
  center: {
    x: "(W-w)/2",
    y: "(H-h)/2"
  }
};