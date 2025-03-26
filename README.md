<br>

<p align="center">
<a href="https://mpxjs.cn" target="__blank"><img src="./asset/mpx-icon.png" alt="Mpx" width="80px" /></a>

<h1 align="center">Mpx Template Features for VS Code</h1>

<p align="center">
<a href="https://marketplace.visualstudio.com/items?itemName=wangshun.mpx-template-features" target="__blank"><img src="https://img.shields.io/visual-studio-marketplace/v/wangshun.mpx-template-features?color=0098FF&amp;label=Visual%20Studio%20Marketplace&amp;labelColor=000&amp;logo=visual-studio-code&amp;logoColor=0098FF" alt="Visual Studio Marketplace Version" /></a>
</p>

<br>

## ⚡ 插件 Features

1. 🚀 **定义跳转**：`<template>` 支持 `定义跳转`（附带下划线样式）：自定义标签名，类名，属性中的变量、方法名
   - template 中属性的 `变量、方法` 支持跳转到 `<script> 中的定义位置`
   - template 中的 `class 类名` 支持跳转到 `<style> 样式脚本对应位置`
   - template 中的 `自定义的组件标签名` 支持跳转到 `自定义组件所在的文件`
   - template 中 `component 组件 range 属性` 支持跳转到对应的组件中
   - template 中的属性、子集支持多表达式解析，分析出变量、方法并支持跳转
2. 🚀 **Hover**：`class 类名` hover 展示对应的 style 样式片段
3. 🚀 **自动转为原子类**：`hover` 中支持将 `stylus class` 对应的样式一键转换为 `Unocss`
   -  支持自定义转换规则，配置文件：`css2uno.config.js`, 示例见[下文详情](#自定义转换-unocss-规则)
4. 🚀 **自动补全**：注意 class 等属性值默认不支持自动补全，可以通过 `{`、`(`, `'`、`"` 等符号主动唤起自动触发
5. 🚀 **视图拆分**：支持拆分 SFC 文件为多个编辑视图。比如同时在左侧/上侧编写 `<script>`，右侧/下侧编写 `<template>`

## 演示

<!-- ![示例动画](./asset/mpx-video.gif) -->

- `class` 样式 `hover` 效果，可自动转换为原子类 `Unocss`
  
   <img src="./asset/mpx-feature-transform-unocss-before.png" alt="hover class" width="700"/>

   <img src="./asset/mpx-feature-transform-unocss-after.png" alt="hover class" width="700"/>

- 定义跳转
  
   <img src="./asset/mpx-features-tag-jump.png" alt="定义跳转" width="700"/>

支持 ts paths

   <img src="./asset/mpx-feature-ts-paths-resolve.png" alt="ts paths resolve" width="700"/>

component tag 支持快速跳转
   <img src="./asset/mpx-features-component-tag-range.png" alt="component tag 跳转" width="700"/>

- 视图拆分
  
   <img src="./asset/mpx-features-split-editors.png" alt="视图拆分" width="700"/>

## 自定义转换 Unocss 规则

```js
const familyMap = {
  PingFangSC: {
    basename: 'PF',
    weightMap: {
      Regular: '400',
      Medium: '500',
      Semibold: '600'
    }
  }
}

module.exports = {
  rules: [
    /** 自定义规则, eg: `font-family: PingFangSC-Medium` -> `PF-500` */
    [
      'font-family' /** style 的 Property */,
      (value /** style 的 value */) => {
        const [basename = '', weight = ''] = value.split('-')
        const family = familyMap[basename]
        if (family) {
          const weightValue = family.weightMap[weight]
          if (weightValue) {
            return `${family.basename}-${weightValue}` // 最终转换结果
          }
        }
        // return true // 如果返回 true, 继续走后续 unocss 默认转换
      }
    ],
    /** 后处理, eg: `background: #fff` --> `bg-[#fff]` --> `bg-#fff` */
    [
      /background(-color)?/,
      (value /** 先经过插件内部 unocss 转换后的结果, eg: bg-[#fff] */) => {
        return value.replace(/[[]/g, '').replace(/[\]]/g, '')
      },
      {
        /**
         * 执行时机：
         * - pre（默认）:在转换 unocss 处理之前
         * - post:在转换 unocss 处理之后
         */
        enforce: 'post',
        // 未来可能支持更多参数，比如 inludes, excludes ..
      }
    ]
  ]
}

```

## Also shout out to

- [@shulandmimi](https://github.com/shulandmimi)

<!-- ## 发布
vscode 插件发布流程：
# npm install -g @vscode/vsce@3.3.0
1. vsce login wangshun（登录过就不用再登录了，登录过期后需要重新申请vscode token，参考: https://dev.azure.com/wangshunnn/_usersSettings/tokens, https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token）
2. npm run pack（打包 vsce package）
3. npm run publish:patch（自动更新小版本并且发布 vsce publish patch）
4. 发布成功后 push 代码和 tag
5. git push origin main
6. git push origin --tags v1.0.x
-->
