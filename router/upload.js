const fileProcessor = require("../services/fileProcessor");
const fs = require("fs");
const PATH = require('path')
const { maxConcurrentVCount } = require("../configs");
const maxConcurrent = maxConcurrentVCount || 5;
let pendingRequests = [];
let tempSaveData = [];
let activeRequests = 0;
// 从临时文件中读取之前保存的视频数据
const savedData = readTempJSON();
savedData.forEach((props) => {
  pendingRequests.push({ ...props });
  tempSaveData.push({ ...props });
  if (activeRequests < maxConcurrent) {
    processNextRequest();
  }
});
module.exports = async (ctx, next) => {
  const { body } = ctx;
  const { files, fields } = body;
  const { file, cover } = files;
  let { type, storeUrl, data } = fields;
  data = JSON.parse(data);
  // ctx.data.files = await fileProcessor[type]({
  //   file,
  //   cover,
  //   data,
  //   storeUrl,
  // });
  switch (type) {
    case "mediaVideo":
    case "identityVideo":
      // 将请求参数加入待处理队列
      pendingRequests.push({
        file,
        cover,
        data,
        storeUrl,
        type,
      });
      tempSaveData.push({
        file,
        cover,
        data,
        storeUrl,
        type,
      });
      updateTempJSON(tempSaveData);
      // 如果当前处理数量未达到最大并发数,则立即处理请求
      if (activeRequests < maxConcurrent) {
        processNextRequest();
      }
      break;
    default:
      ctx.data.files = await fileProcessor[type]({
        file,
        cover,
        data,
        storeUrl,
      });
      break;
  }
  await next();
};
function processNextRequest() {
  // 如果没有待处理请求,则直接返回
  if (pendingRequests.length === 0) return;
  // 从待处理队列中取出下一个请求
  const props = pendingRequests.shift();
  activeRequests++;
  // 调用视频上传方法
  return handleVideoUpload(props)
    .then(() => {
      tempSaveData.splice(
        tempSaveData.findIndex((item) => item.data.rid === props.data.rid),
        1
      );
      updateTempJSON(tempSaveData);
    })
    .finally(() => {
      activeRequests--;
      // 尝试处理下一个待处理请求
      processNextRequest();
    });
}
async function handleVideoUpload(props) {
  const { file, cover, data, storeUrl, type } = props;
  await fileProcessor[type]({
    file,
    cover,
    data,
    storeUrl,
  });
}
function readTempJSON() {
  const rootDir = process.cwd();
  const filePath = PATH.join(rootDir, "tempVideos.json");

  try {
    // 读取 JSON 文件
    const fileData = fs.readFileSync(filePath, "utf8");
    const jsonData = JSON.parse(fileData);

    // 检查读取的数据是否为对象,且 data 属性是数组
    if (typeof jsonData !== "object" || !Array.isArray(jsonData.data)) {
      throw new Error("Invalid JSON data format");
    }

    return jsonData.data;
  } catch (err) {
    // 如果文件不存在,返回空数组
    if (err.code === "ENOENT") {
      return [];
    } else {
      console.error("Error reading JSON file:", err);
      throw err;
    }
  }
}
async function writeTempJSON(data) {
  // 检查输入数据是否为数组
  if (!Array.isArray(data)) {
    throw new Error("Input data must be an array");
  }

  const rootDir = process.cwd();
  const filePath = PATH.join(rootDir, "tempVideos.json");

  try {
    // 写入更新后的数据
    await fs.promises.writeFile(filePath, JSON.stringify({ data }, null, 2));
  } catch (err) {
    console.error("Error writing JSON file:", err);
    throw err;
  }
}
function updateTempJSON(tempArary) {
  writeTempJSON(JSON.parse(JSON.stringify([...tempArary])));
}
