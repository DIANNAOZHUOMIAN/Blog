---
title: C# WinForms 窗体与控件
date: 2026-06-23
tags: [C#, WinForms, 桌面开发, UI]
summary: 项目结构、常用控件与事件速查、跨线程更新（Invoke）、自定义控件三种方式、GDI+ 绘制与双缓冲、性能与第三方控件库。
---

# C# WinForms 窗体与控件

WinForms 是 .NET 上成熟的桌面 UI 框架，事件驱动、所见即所得。想要 MVVM 与数据绑定更强的方案见 [C# WPF](wpf.html)。

## 一、项目结构

| 文件 | 作用 |
|---|---|
| `Program.cs` | 入口：`ApplicationConfiguration.Initialize();` + `Application.Run(new MainForm());` |
| `MainForm.cs` | 窗体逻辑（事件处理） |
| `MainForm.Designer.cs` | 设计器**自动生成**的控件初始化代码（`InitializeComponent`） |
| `MainForm.resx` | 窗体资源/本地化 |
| `App.config` | 连接字符串、配置节 |

`MainForm.cs` 与 `MainForm.Designer.cs` 是同一个类的两个 `partial` 片段——这正是 [部分类](c-抽象类-接口-密封类-部分类.html) 的经典用途：手写逻辑与生成代码分离。

## 二、常用控件速查

### 布局容器

`Panel`、`GroupBox`、`TableLayoutPanel`、`FlowLayoutPanel`、`SplitContainer`、`TabControl`——配合 `Dock`/`Anchor` 实现自适应。

### 输入与选择

| 控件 | 关键属性 | 关键事件 |
|---|---|---|
| `TextBox` | `Text` `Multiline` `PasswordChar` `ReadOnly` | `TextChanged` `KeyPress` `Validating` |
| `MaskedTextBox` | `Mask` `PromptChar` | `MaskInputRejected` |
| `ComboBox` | `Items` `DataSource` `DropDownStyle` | `SelectedIndexChanged` |
| `CheckBox` | `Checked` `ThreeState` | `CheckedChanged` |
| `RadioButton` | `Checked` | `CheckedChanged` |
| `NumericUpDown` | `Value` `Minimum` `Maximum` | `ValueChanged` |
| `DateTimePicker` | `Value` `Format` `CustomFormat` | `ValueChanged` |

`DropDownStyle = DropDownList` 可禁止自由输入；`Validating` 可拦截非法输入并阻止焦点切换。

### 命令与导航

`Button`（配合 `AcceptButton`/`CancelButton` 响应回车/ESC）、`LinkLabel`、`MenuStrip`/`ToolStrip`、`StatusStrip`、`NotifyIcon`（托盘）。

### 数据展示

| 控件 | 说明 |
|---|---|
| `DataGridView` | 表格；支持数据绑定、`VirtualMode` 虚拟模式、单元格自绘 |
| `ListView` | 列表/图标视图，`OwnerDraw` 自定义渲染 |
| `TreeView` | 树形；`BeginUpdate`/`EndUpdate` 防闪烁 |
| `PictureBox` | 图片，`SizeMode.Zoom` 等比缩放 |
| `ProgressBar` | 进度，`Style = Marquee` 表示不确定进度 |
| `Chart` | 折线/柱状/饼图（`System.Windows.Forms.DataVisualization`） |

## 三、事件与委托

WinForms 完全建立在**委托/事件**之上（基础见 [C# 委托](c-委托.html) 与 [C# 事件](c-事件.html)）。典型自定义事件：

```csharp
public class TemperatureSensor
{
    public event EventHandler<TemperatureEventArgs>? TemperatureChanged;
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 1000 };

    public TemperatureSensor() => _timer.Tick += (s, e) => Raise();
    public void Start() => _timer.Start();

    private void Raise()
    {
        double temp = 20 + Random.Shared.NextDouble() * 70;
        TemperatureChanged?.Invoke(this, new TemperatureEventArgs(temp));
    }
}

public record TemperatureEventArgs(double Current) : EventArgs;
```

建议在构造函数或 `OnLoad` 集中绑定事件，并在 `FormClosing`/`Dispose` 中 `-=` 解绑、释放计时器，避免内存泄漏。

## 四、跨线程更新控件（最常见的坑）

**控件只能在创建它的 UI 线程上更新。** 后台线程要改界面，必须通过 `Invoke`（同步）或 `BeginInvoke`（异步）切回 UI 线程：

```csharp
private void OnTemperatureChanged(object? sender, TemperatureEventArgs e)
{
    if (InvokeRequired)                  // 当前不在 UI 线程
    {
        BeginInvoke(() => OnTemperatureChanged(sender, e));
        return;
    }
    lblCurrent.Text = $"当前温度：{e.Current:F1}℃";
    if (e.Current >= 80)
        notifyIcon1.ShowBalloonTip(3000, "警告", "温度过高！", ToolTipIcon.Warning);
}
```

耗时操作用 `async/await` 或 `BackgroundWorker`，配合 `IProgress<T>` 反馈进度、`CancellationToken` 支持取消，避免界面冻结。线程基础见 [C# 多线程](c-线程与并发.html)。

## 五、自定义控件

> 组件（Component）⊃ 控件（Control）。组件继承 `Component`，控件继承 `Control`（`Control` 本身也继承 `Component`）。重点是**公开属性、公开事件、了解渲染配置**。

三种方式：

```csharp
// a. 复合控件：组合若干标准控件
public class SearchBox : UserControl { /* TextBox + Button */ }

// b. 扩展控件：在现有控件上扩展
public class RoundButton : Button
{
    protected override void OnPaint(PaintEventArgs e) { base.OnPaint(e); /* 自绘圆角 */ }
}

// c. 完全自定义：从零绘制
public class Gauge : Control
{
    protected override void OnPaint(PaintEventArgs e) { /* GDI+ 全自绘 */ }
}
```

设计期体验用特性增强：`[Category]` `[Description]` `[Browsable]` `[DesignerSerializationVisibility]`。

## 六、绘制与双缓冲

```csharp
protected override void OnPaint(PaintEventArgs e)
{
    var g = e.Graphics;
    g.SmoothingMode = SmoothingMode.AntiAlias;     // 抗锯齿
    g.DrawString("Hello", Font, Brushes.Black, 10, 10);
}
```

减少闪烁：设置 `DoubleBuffered = true`；局部刷新用 `Invalidate(Rectangle)` 而非整体 `Refresh()`；批量更新用 `SuspendLayout`/`ResumeLayout` 与 `BeginUpdate`/`EndUpdate`。多分辨率用 `AutoScaleMode = Dpi` + `Anchor`/`Dock`。

## 七、性能与资源

- `using` / `Dispose` 及时释放 `Image`、`Graphics`、`DataTable` 等非托管资源。
- 列表/表格用**虚拟模式**加载海量数据，复用控件实例。
- 数据级缓存用 `IMemoryCache` 或自定义 LRU，减少 DB 往返。

## 八、第三方控件库

- **商业**：DevExpress、Telerik UI for WinForms、ComponentOne、Infragistics——高性能表格、Ribbon、图表、Docking。
- **开源**：SunnyUI、MaterialSkin、Krypton Toolkit——快速现代化界面。

> 引入时注意许可证与 DPI 适配，统一隔离到专用 UI 层。

## 速记

- `Designer.cs` 是 `partial` 片段，别手改自动生成代码。
- 跨线程改控件 → `InvokeRequired` + `Invoke`/`BeginInvoke`。
- 自定义控件三选一：复合 `UserControl` / 扩展现有控件 / 自绘 `Control`。
- 防闪烁：`DoubleBuffered` + 局部 `Invalidate` + 批量更新。
