# 将excalidraw绘画引擎迁移至drawio绘画引擎
目标为将项目中的excalidraw绘画引擎迁移至drawio绘画引擎，完成所有相关的工作。

## 要点
1. 集成方式以及参数传入变更，新的drawio集成方式参考文档 `Embed mode.md`
2. `prompt.js`更新，以适配drawio语法
3. 相关文案更新，以及readme更新

---

## 迁移进度记录

### ✅ 已完成的任务

#### 1. 创建 DrawioCanvas.jsx 组件
- **文件**: `components/DrawioCanvas.jsx`
- **完成内容**:
  - 使用 iframe 嵌入 Draw.io (`https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1`)
  - 实现 postMessage 双向通信协议
  - 处理 `init`、`load`、`save`、`autosave`、`exit`、`error` 等事件
  - 实现 XML 数据加载和保存功能
  - 添加加载状态和错误处理
  - 提供 `exportDiagram` 和 `mergeDiagram` 工具方法

#### 2. 更新 app/page.js 主页面
- **文件**: `app/page.js`
- **完成内容**:
  - 移除 `optimizeExcalidrawCode` 导入和相关函数
  - 将 `ExcalidrawCanvas` 替换为 `DrawioCanvas`
  - 状态管理更新:
    - `elements` → `diagramXml`
    - `jsonError` → `xmlError`
    - 移除 `isOptimizingCode` 状态
  - 函数更新:
    - `postProcessExcalidrawCode` → `postProcessDrawioCode`
    - `tryParseAndApply` 改为 XML 验证逻辑
    - 移除 `handleOptimizeCode` 函数
    - 新增 `handleSaveDiagram` 函数
  - UI 更新:
    - 标题: "Smart Excalidraw" → "Smart Draw.io"
    - GitHub 链接更新
    - 页脚版本信息更新
  - CodeEditor 组件调用更新:
    - 移除 `onOptimize` 和 `isOptimizingCode` 属性
    - `jsonError` → `xmlError`

#### 3. 重写 lib/prompts.js
- **文件**: `lib/prompts.js`
- **完成内容**:
  - ✅ 将 SYSTEM_PROMPT 从 Excalidraw JSON 格式改为 Draw.io mxGraph XML 格式
  - ✅ 编写完整的 Draw.io mxGraph XML 语法说明
  - ✅ 包含基本结构、核心元素类型（矩形、椭圆、菱形、连接线、文本、泳道、容器）
  - ✅ 提供 ID 管理规则和常用颜色方案
  - ✅ 包含 3 个高质量 XML 示例（流程图、架构图、思维导图）
  - ✅ 更新所有 20+ 图表类型的视觉规范，完全适配 Draw.io XML 格式
  - ✅ 更新 `USER_PROMPT_TEMPLATE` 函数，所有引用改为 Draw.io
  - ✅ 保持所有图表类型支持（flowchart, mindmap, orgchart, sequence, class, er, gantt, timeline, tree, network, architecture, dataflow, state, swimlane, concept, fishbone, swot, pyramid, funnel, venn, matrix, infographic）

### ⏳ 待完成的任务

#### 4. 更新 API 路由注释
- **文件**: `app/api/generate/route.js`
- **需要完成**: 更新注释中的 "Generate Excalidraw code" → "Generate Draw.io XML code"

#### 5. 删除箭头优化文件
- **文件**: `lib/optimizeArrows.js`
- **操作**: 删除整个文件（Draw.io 原生处理连接线优化）

#### 6. 清理组件中的 Excalidraw 引用
- **文件**:
  - `components/AccessPasswordModal.jsx`
  - `components/Chat.jsx`
  - `components/CodeEditor.jsx`
  - `components/HistoryModal.jsx`
- **需要完成**: 更新注释和 UI 文案中的 "Excalidraw" → "Draw.io"

#### 7. 更新 package.json
- **文件**: `package.json`
- **需要完成**:
  - `name`: "smart-excalidraw-next" → "smart-drawio-next"
  - 移除依赖: `@excalidraw/excalidraw`

#### 8. 更新配置存储键名
- **文件**: `lib/config.js` 和 `app/page.js`
- **需要完成**:
  - 更新 localStorage 键名:
    - `smart-excalidraw-config` → `smart-drawio-config`
    - `smart-excalidraw-use-password` → `smart-drawio-use-password`
    - `smart-excalidraw-access-password` → `smart-drawio-access-password`
    - `smart-excalidraw-active-config` → `smart-drawio-active-config`
    - `smart-excalidraw-configs` → `smart-drawio-configs`
  - 添加数据迁移逻辑（从旧键名读取并迁移到新键名）

#### 9. 更新元数据
- **文件**: `app/layout.js`
- **需要完成**:
  - `title`: "Smart Excalidraw" → "Smart Draw.io"
  - `description`: 保持 "AI 驱动的图表生成"

#### 10. 更新中文文档
- **文件**: `README.md`
- **需要完成**:
  - 标题和所有 "Excalidraw" 引用改为 "Draw.io"
  - 更新功能描述（XML 格式、Draw.io 集成方式）
  - 更新截图（如有）

#### 11. 更新英文文档
- **文件**: `README_EN.md`
- **需要完成**: 与中文版同步更新

---

## 技术要点总结

### Draw.io 集成方式
- **URL**: `https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1`
- **通信协议**: postMessage JSON 格式
- **数据格式**: mxGraph XML

### 主要变更
1. **从 React 组件到 iframe**: Excalidraw 使用 React 组件，Draw.io 使用 iframe 嵌入
2. **从 JSON 到 XML**: 数据格式从 JSON 数组改为 XML 字符串
3. **移除优化逻辑**: Draw.io 原生处理图形优化，无需额外代码
4. **Monaco 编辑器**: 语言模式从 JavaScript 改为 XML

### 保留的功能
- ✅ AI 驱动的图表生成
- ✅ 20+ 图表类型支持
- ✅ 访问密码系统
- ✅ 历史记录管理
- ✅ 代码编辑器
- ✅ 多配置支持
- ✅ 图片上传
- ✅ 流式响应
- ✅ 可调整面板布局

---

## 下一步行动

1. **优先级最高**: 完成 `lib/prompts.js` 的重写（Draw.io XML 格式 prompt）
2. 完成剩余的代码清理和文档更新工作
3. 测试所有功能确保正常运行
4. 更新 README 和相关文档