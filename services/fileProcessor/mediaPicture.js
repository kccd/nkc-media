const PATH = require('path');
const {
  storeClient,
  spawnProcess
} = require('../../tools');
const tools = require('../../tools');
const {platform} = require("os");
const {sendMessageToNkc} = require('../../socket')
const os = platform();
const linux = (os === 'linux');

const PictureMaxSize = {
  lg: {
    width: 7680,
    height: 4320
  },
  normal: {
    width: 1920,
    height: 1080,
  },
  md: {
    width: 640,
    height: 360,
  },
  sm: {
    width: 150,
    height: 150,
  }
};

// 图片最大高度不超过10万像素
const PictureMaxHeight = 10 * 10000;


module.exports = async (props) => {
  const {
    file,
    cover,
    data,
    storeUrl
  } = props;
  const {
    waterGravity,
    mediaPath,
    originPath,
    originId,
    timePath,
    flex,
    rid,
    ext,
    toc,
    waterAdd,
    enabled,
    minWidth,
    minHeight,
    transparency,
  } = data;
  const filePath = file.path;//临时目录
  const time = (new Date(toc)).getTime();

  const filenamePath = `${originId}.${ext}`;
  const filesInfo = {};//用于存储在数据库的文件类型
  //构建原图存储地址
  const path = PATH.join(originPath, timePath, filenamePath);
  const storeData = [{
    filePath: filePath,
    path,
    time,
  }];
  //缩略图
  let thumbnailPath = filePath + `_sm.${ext}`;
  //中图
  let mediumPath = filePath + `_md.${ext}`;
  // normal图
  let normalPath = filePath + `_normal.${ext}`;
  let lgPath = filePath + `_lg.${ext}`;
  //保存水印输出图
  let outputPath = filePath + `_ffmpeg.${ext}`;
  //小图名
  const smFileName = `${rid}_sm.${ext}`;
  //中图名
  const mdFileName = `${rid}_md.${ext}`;
  //大图名
  const normalFileName = `${rid}.${ext}`;
  // 超大图
  const lgFileName = `${rid}_lg.${ext}`;
  //小图在存储服务中的 路径
  const smStorePath = PATH.join(mediaPath, timePath, smFileName);
  //中图在存储服务中的路径
  const mdStorePath = PATH.join(mediaPath, timePath, mdFileName);
  // 超大图在存储服务中的路径
  const lgStorePath = PATH.join(mediaPath, timePath, lgFileName);
  //水印大图在存储服务中的路径
  const normalStorePath = PATH.join(mediaPath, timePath, normalFileName);



  const func = async () => {
    //识别图片信息并自动旋转，去掉图片的元信息
    await tools.imageAutoOrient(filePath);
    //获取文件所在目录
    //获取图片尺寸
    const originFileInfo = await tools.getFileInfo(filePath);

    // 判断图片宽度有没有超过 8K
    if(originFileInfo.width > PictureMaxSize.lg.width) {
      // 宽度超过了 8K，需要将宽度调整到 8K
      // 判断当宽度调整为 8K 时，高度有没有超过 10 万像素
      // 如果超过了，则根据高度 10 万像素重新计算宽度
      let targetWidth = PictureMaxSize.lg.width;
      let targetHeight = targetWidth * originFileInfo.height / originFileInfo.width;
      if(targetHeight > PictureMaxHeight) {
        targetHeight = PictureMaxHeight;
        targetWidth = targetHeight * originFileInfo.width / originFileInfo.height;
      }
      await imageNarrow(filePath, filePath, `${targetWidth}x${targetHeight}\>`);
    }

    // 重新获取图片的尺寸以及文件大小
    const {width, height} = await tools.getFileInfo(filePath);

    // 满足一下条件即可为图片添加水印
    // 图片尺寸超过设定值
    // 后台管理、用户设置均开启了打水印
    // 非 GIF 图片
    if(
      width >= minWidth &&
      height >= minHeight &&
      waterAdd &&
      enabled &&
      ext !== 'gif'
    ) {
      await saveffmpeg(filePath, cover, waterGravity, outputPath, flex, transparency);
    } else {
      outputPath = filePath;
    }

    // 肯定需要生成缩略图
    await imageNarrow(filePath, thumbnailPath, `${PictureMaxSize.sm.width}x${PictureMaxSize.sm.height}\>`);

    // 如果图片宽度超过了中等尺度，则生成中图
    if(width > PictureMaxSize.md.width) {
      await imageNarrow(outputPath, mediumPath, `${PictureMaxSize.md.width}x${PictureMaxSize.md.height}\>`);
    }

    // 如果图片宽度超过了默认图宽度，则将生成默认图
    // 如果未超过则直接复制原图作为默认图
    if(width > PictureMaxSize.normal.width) {
      await imageNarrow(outputPath, normalPath, `${PictureMaxSize.normal.width}x${PictureMaxSize.normal.height}\>`);
    } else {
      await tools.copyFile(outputPath, normalPath);
    }

    // 如果图片宽度超过了默认图宽度，则还需要生成一张大图
    if(width > PictureMaxSize.normal.width) {
      await tools.copyFile(outputPath, lgPath);
    }

    if(await tools.accessFile(lgPath)) {
      storeData.push({
        filePath: lgPath,
        path: lgStorePath,
        time,
      });
      const lgInfo = await tools.getFileInfo(lgPath);
      lgInfo.name = lgFileName;
      filesInfo.lg = lgInfo;
    }

    if(await tools.accessFile(normalPath)) {
      storeData.push({
        filePath: normalPath,
        path: normalStorePath,
        time,
      });
      const defInfo = await tools.getFileInfo(normalPath);
      defInfo.name = normalFileName;
      filesInfo.def = defInfo;
    }

    if(await tools.accessFile(thumbnailPath)) {
      storeData.push({
        filePath: thumbnailPath,
        path: smStorePath,
        time,
      });
      const smInfo = await tools.getFileInfo(thumbnailPath);
      smInfo.name = smFileName;
      filesInfo.sm = smInfo;
    }

    if(await tools.accessFile(mediumPath)) {
      storeData.push({
        filePath: mediumPath,
        path: mdStorePath,
        time,
      });
      const mdInfo = await tools.getFileInfo(mediumPath);
      mdInfo.name = mdFileName;
      filesInfo.md = mdInfo;
    }

    await storeClient(storeUrl, storeData);
    await sendMessageToNkc('resourceStatus', {
      rid,
      status: true,
      filesInfo
    });
  }
  func()
    .catch(err => {
      console.log(err);
      return sendMessageToNkc('resourceStatus', {
        rid,
        status: false,
        error: err.message || err.toString()
      });
    })
    .finally(async () => {

      const filePaths = [
        thumbnailPath,
        mediumPath,
        lgPath,
        normalPath,
        filePath,
        cover.path,
        outputPath
      ];

      for(const item of filePaths) {
        try{
          if(await tools.accessFile(item)) {
            await tools.deleteFile(item);
          }
        } catch(err) {
          console.error(err);
        }
      }
    });
}

//图片打水印
async function ffmpegWaterMark(filePath, cover, waterGravity, output, flex, transparency = 1){
  return addImageTextWaterMaskForImage({
    input: filePath,
    output: output,
    image: cover.path,
    text: '',
    transparency,
    position: gravityToPositionMap[waterGravity],
    flex,
  })
}

//保存缩略图
function saveffmpeg (filePath, cover, waterGravity, output, flex, transparency) {
  return ffmpegWaterMark(filePath, cover, waterGravity, output, flex, transparency)
}

// 去除图片附加信息并调整大小
const imageNarrow = (path, outputPath, size) => {
  if(linux) {
    return spawnProcess('convert', [path, '-coalesce', '-resize', size, '-strip', '-deconstruct', outputPath])
  } else {
    return spawnProcess('magick', ['convert', path, '-coalesce', '-resize', size, '-strip', '-deconstruct', outputPath])
  }
}

/**
 * ffmpeg图片滤镜处理
 * @param {string} inputPath 输入文件路径
 * @param {string} outputPath 输出文件路径
 * @param {array} filters 滤镜指令（数组，一层滤镜一个元素）
 */
const ffmpegImageFilter = async (inputPath, outputPath, filters) => {
  return spawnProcess('ffmpeg',
    [
      ...['-i', inputPath],                                              /* 输入 */
      ...['-filter_complex', filters.join(";")],                         /* 滤镜表达式 */
      '-y',                                                              /* 覆盖输出 */
      outputPath                                                         /* 输出 */
    ]);
}

/**
 * 图片添加图文水印
 * @param {object} op 配置
 * 配置项：
 *  input 输入路径， output 输出路径， image 图片路径， text 文字, flex 水印占整个图片高度的百分比, position 水印位置
 */
async function addImageTextWaterMaskForImage(op) {
  let {
    input,
    output,
    image,
    flex = 8,
    position,
    transparency = 1,
    additionOptions,
  } = op;
  const {height: imageHeight, width: imageWidth} = await tools.getFileInfo(input);
  const {size} = await tools.getFileInfo(image);
  const logoSize = size;
  let padHeight = ~~((imageHeight > imageWidth? imageWidth: imageHeight) * (flex/100));
  // let logoHeight = padHeight - 1;
  let logoHeight = padHeight;
  let logoWidth = ~~(logoSize.width * (logoHeight / logoSize.height)) - 1;
  const fontSize = padHeight - 10;
  const gap = ~~(logoWidth * 0.1); /* logo和文字之间和间隔 */
  // let padWidth = logoWidth + gap;
  image = image.replace(/\\/g, "/").replace(":", "\\:");
  return ffmpegImageFilter(input, output, [
    `movie='${image}'[logo]`,
    `[logo]scale=${logoWidth}:${logoHeight}[image]`,
    `[image]drawtext=x=${logoWidth + gap}:y=${logoHeight}/2:text='':fontsize=${fontSize}:fontcolor=fcfcfc:fontfile=':shadowcolor=b1b1b1:shadowx=1:shadowy=1', lut=a=val*${transparency}[watermask]`,
    `[0:v][watermask]overlay=${position.x}:${position.y}`
  ], additionOptions)
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
