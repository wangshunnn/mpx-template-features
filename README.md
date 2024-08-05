<br>

<p align="center">
<a href="https://mpxjs.cn" target="__blank"><img src="./asset/mpx-icon.png" alt="Mpx" width="80px" /></a>

<h1 align="center">Mpx Template Features for VS Code</h1>

<p align="center">
<a href="https://marketplace.visualstudio.com/items?itemName=wangshun.mpx-template-features" target="__blank"><img src="https://img.shields.io/visual-studio-marketplace/v/wangshun.mpx-template-features?color=0098FF&amp;label=Visual%20Studio%20Marketplace&amp;labelColor=000&amp;logo=visual-studio-code&amp;logoColor=0098FF" alt="Visual Studio Marketplace Version" /></a>
</p>

<br>

## ⚡ 插件 Features

1. `<template>` 支持 `定义跳转`（附带下划线样式）：自定义标签名，类名，属性中的变量、方法名。
2. template 中属性的 `变量、方法` 支持跳转到 `<script> 中的定义位置`。
3. template 中的 `class 类名` 支持跳转到 `<style> 样式脚本对应位置`。
4. template 中的 `自定义的组件标签名` 支持跳转到 `自定义组件所在的文件`。
5. 支持拆分 SFC 文件为多个编辑视图。比如同时在左侧/上侧编写 `<script>`，右侧/下侧编写 `<template>`。

## 演示

![示例动画](./asset/mpx-video.gif)

## 示例

- 鼠标放在可跳转的类名、变量、方法名时会有对应的跳转提示，`cmd+单击` 或 `右键-转到定义` 可直接跳转到对应定义位置，`class` 类名点击则会跳转到 `<style>` 中对应的样式。

  ![示例图片](./asset/mpx-features-demo.png)

- 鼠标放在可跳转的自定义组件标签上时会有对应的跳转提示，`cmd+单击` 或 `右键-转到定义` 可直接跳转到组件对应的文件。

  ![示例图片](./asset/mpx-features-tag-jump.png)

- 拆分 SFC 文件为多个编辑视图。点击顶部文件菜单栏的 Mpx logo 图标。
  ![示例图片](./asset/mpx-features-split-editors.png)

<!-- ## 发布
vscode 插件发布流程：
# npm i vsce -g
1. vsce login wangshun（登录过就不用再登录了，登录过期后需要重新申请vscode token，参考: https://dev.azure.com/wangshunnn/_usersSettings/tokens, https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token）
2. npm run pack（打包 vsce package）
3. npm run publish:patch（自动更新小版本并且发布 vsce publish patch）
4. 发布成功后 push 代码和 tag
5. git push origin main
6. git push origin --tags v1.0.x
-->
