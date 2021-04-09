import path from 'path';
import fse from 'fs-extra';
import chalk from 'chalk';
import Toml from '@ltd/j-toml';
import log from '@zppack/log';
import zpGlob from '@zppack/glob';

const CONFIG_NAME = '.zp-pick.toml';
const PICK_PREFIX = 'zppick_';
const PICK_SEPERATOR = '_';
const PICK_STATUS = {
  pending: 'pending',
  picked: 'picked',
  unpicked: 'unpicked',
};

const getConfig = (configFile) => {
  log.d('Zp-pick: exist `' + CONFIG_NAME + '` file.');

  const content = fse.readFileSync(configFile, 'utf8');
  log.d('Zp-pick: content: \n', chalk.gray(content));
  if (!content) {
    return {};
  }

  const config = Toml.parse(content, 1.0, '\n', false);
  log.d('Zp-pick: original config: \n', chalk.gray.bold(JSON.stringify(config)));
  return config;
};

const getFileInfos = (files) => {
  return files.map((filepath) => {
    const file = path.basename(filepath);
    const dir = path.dirname(filepath);
    const arr = file.split('.');
    const fileNameArr = [];
    const pickRuleArr = [];
    arr.forEach((part) => {
      if (part.startsWith(PICK_PREFIX) && part.split(PICK_SEPERATOR).length > 2) {
        pickRuleArr.push(part.replace(PICK_PREFIX, ''));
      } else {
        fileNameArr.push(part);
      }
    });
    const pickRules = pickRuleArr.map((ruleStr) => {
      const [pickKey, ...pickValArr] = ruleStr.split(PICK_SEPERATOR);
      return {
        pickKey,
        pickValue: pickValArr.join(PICK_SEPERATOR)
      };
    });
    const targetFileName = fileNameArr.join('.');
    return {
      sourceFilePath: filepath,
      sourceFileName: file,
      dir,
      targetFileName,
      targetFilePath: path.resolve(dir, targetFileName),
      pickRules,
      status: PICK_STATUS.pending,
    };
  });
};

// 设置每条pick规则支持的匹配模式，一个字符代表一个模式，可以叠加
// i ! ^ $ * u
// i: ignore case；在正则模式下将自动添加 i 修饰符
// !: 结果取反，对应识别值也必须以 ! 开头；若未以 ! 开头，则忽略取反规则；在正则模式下将忽略此规则
// ^: 匹配开头；在正则模式下将自动在正则表达式开头添加 ^
// $: 匹配结尾；在正则模式下将自动在正则表达式末尾添加 $；`^$` 完全匹配
// *: 模糊匹配，将 "<dot>" 替换为 "."， 开启正则表达式模式，出现一次即可
// u: unicode 模式，必须开启正则模式后使用（*u），否则将忽略此规则
// 不支持 y s
const pickFiles = (fileInfos, options, pickOpts) => {
  return fileInfos.map((fileInfo) => {
    const picked = fileInfo.pickRules.every(({ pickKey, pickValue }) => {
      if (options[pickKey]) {
        const targetVal = options[pickKey];
        const dec = pickOpts[pickKey] ?? '=';
        if (dec === '=') {
          // 没有配置匹配修饰规则的，进行完全匹配
          return targetVal === pickValue;
        }
        const notTag = dec.includes('!');
        const regTag = dec.includes('*');
        const iTag = dec.includes('i');
        const startTag = dec.includes('^');
        const endTag = dec.includes('$');
        const uTag = dec.includes('u');
        if (!regTag) {
          // 非正则模式
          let leftTargetVal = targetVal;
          let leftPickVal = pickValue;
          if (iTag) {
            leftTargetVal = leftTargetVal.toLowerCase();
            leftPickVal = leftPickVal.toLowerCase();
          }
          let tempResult = false;
          let resultInvert = false;
          if (notTag && leftPickVal.startsWith('!')) {
            leftPickVal = pickValue.replace('!', '');
            resultInvert = true;
          }
          if (startTag && !endTag) {
            tempResult = leftTargetVal.startsWith(leftPickVal);
          } else if (!startTag && endTag) {
            tempResult = leftTargetVal.endsWith(leftPickVal);
          } else {
            tempResult = leftTargetVal === leftPickVal;
          }

          return resultInvert ? !tempResult : tempResult;
        } else {
          // 正则模式
          let ex = pickValue.replace(/<dot>/g, '.');
          if (startTag && !ex.startsWith('^')) {
            ex = '^' + ex;
          }
          if (endTag && !ex.endsWith('$')) {
            ex = ex + '$';
          }
          const regEx = new RegExp(ex, `${iTag ? 'i' : ''}${uTag ? 'u' : ''}`);
          return regEx.test(targetVal);
        }
      }
      // 没有获取到输入值的 pick 项，将直接剔除
      return false;
    });
    return {
      ...fileInfo,
      status: picked ? PICK_STATUS.picked : PICK_STATUS.unpicked,
    };
  });
};

const handleFiles = (fileInfos) => {
  log.i('Zp-pick: removing unpicked files and rename picked files...');
  let unpickedFileCount = 0;
  let renamedFileCount = 0;
  fileInfos.forEach((fileInfo) => {
    if (fileInfo.status === PICK_STATUS.unpicked) {
      unpickedFileCount += 1;
      log.d('Zp-pick: removing file ' + chalk.underline(fileInfo.sourceFilePath));
      fse.removeSync(fileInfo.sourceFilePath);
    } else if (fileInfo.sourceFileName === fileInfo.targetFileName) {
      renamedFileCount += 1;
      log.d('Zp-pick: renaming file ' + chalk.underline(fileInfo.sourceFileName) + ' to ' + chalk.underline(fileInfo.targetFileName));
      fse.renameSync(fileInfo.sourceFilePath, fileIndo.targetFilePath);
    }
  });
  log.i(`Zp-pick: done. ${unpickedFileCount} files removed. ${renamedFileCount} files renamed.`);
};

/**
 * @param {*} ctx
 *  tplBasePath: "template-project-std"
 *  tplPath: "template-project-std/template-project"
 *  configDir: ".zp"
 *  options: {}
 * @param {*} next
 */
const middleware = async (ctx, next) => {
  log.i('Zp-pick: start `zp-pick` middleware');
  log.d('Zp-pick: recieving context: \n', JSON.stringify(ctx));
  const { tplPath, configDir, options } = ctx;
  const configFilePath = path.join(tplPath, configDir);
  const configFile = path.join(configFilePath, CONFIG_NAME);

  log.d('Zp-pick: tplPath = ', chalk.underline(tplPath));
  log.d('Zp-pick: configFilePath = ', chalk.underline(configFile));
  log.d('Zp-pick: options : \n', chalk.gray(JSON.stringify(options)));

  const existConfigFile = fse.existsSync(configFile);
  if (!existConfigFile) {
    log.w('Zp-pick: connot find config file `.zp-pick.toml`, `zp-pick` middleware will set config to `{}`.');
  }

  const pickOpts = existConfigFile ? getConfig(configFile) : {};
  log.d('Zp-pick: config options: \n', chalk.gray(JSON.stringify(pickOpts)));

  const files = zpGlob.union(['**/*', `!${configDir}/**`, `!${CONFIG_NAME}`, '!.git/**', '!node_modules/**'], { dot: true, cwd: path.resolve(tplPath), nodir: true, realpath: true });
  const fileInfos = getFileInfos(files);
  // log.d('Zp-pick: files info: \n', chalk.gray(JSON.stringify(fileInfos)));

  log.i('Zp-pick: picking files...');
  const resultFileInfos = pickFiles(fileInfos, options, pickOpts);
  log.d('Zp-pick: pick result files: \n', chalk.gray(JSON.stringify(resultFileInfos)));

  handleFiles(resultFileInfos);

  await next();
};

export default middleware;
