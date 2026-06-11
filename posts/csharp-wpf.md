---
title: WPF 详解
date: 2026-06-11
tags: [C#, WPF, XAML]
summary: XAML 体系、布局、依赖属性、附加属性、样式/模板、资源、绑定、路由事件、动画与性能。
---

# WPF

WPF（Windows Presentation Foundation）= XAML 描述 UI + DirectX 渲染 + 强大数据绑定。Win 桌面开发首选。

## 一、XAML 基础

```xml
<Window x:Class="App.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Hello" Width="400" Height="300">
    <Grid>
        <Button Content="Click" Click="OnClick"/>
    </Grid>
</Window>
```

XAML 与 C# 通过 `partial class` 配合，`x:Name` 生成字段，事件指向方法。

## 二、布局体系

| 容器 | 用途 |
|---|---|
| `Grid` | 行列网格，最常用 |
| `StackPanel` | 水平/竖直堆叠 |
| `DockPanel` | 边缘停靠 |
| `WrapPanel` | 自动换行 |
| `Canvas` | 绝对定位 |
| `UniformGrid` | 等分网格 |

```xml
<Grid>
    <Grid.RowDefinitions>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="*"/>
        <RowDefinition Height="2*"/>
    </Grid.RowDefinitions>
    <Grid.ColumnDefinitions>
        <ColumnDefinition Width="100"/>
        <ColumnDefinition/>
    </Grid.ColumnDefinitions>
    <TextBlock Grid.Row="0" Grid.Column="0" Text="Name"/>
    <TextBox  Grid.Row="0" Grid.Column="1" Margin="4"/>
</Grid>
```

`Auto`：按内容；`*`：按比例；像素值：固定。

布局两阶段：`Measure`（求所需尺寸）→ `Arrange`（实际放置）。

## 三、依赖属性（DP）

WPF 的属性系统基础，支撑绑定、动画、样式、继承、默认值。

```csharp
public static readonly DependencyProperty TitleProperty =
    DependencyProperty.Register(
        nameof(Title), typeof(string), typeof(MyControl),
        new PropertyMetadata(default(string),
            (d, e) => ((MyControl)d).OnTitleChanged()));

public string Title {
    get => (string)GetValue(TitleProperty);
    set => SetValue(TitleProperty, value);
}
```

值来源优先级：动画 > 本地值 > 模板 > 样式 > 继承 > 默认。

## 四、附加属性

定义在 A 类、贴在 B 元素上：

```xml
<Button Grid.Row="0" Grid.Column="1"/>
```

`Grid.Row` 就是附加属性。自定义：

```csharp
public static readonly DependencyProperty PlaceholderProperty =
    DependencyProperty.RegisterAttached("Placeholder", typeof(string),
        typeof(TextBoxHelper));
public static void SetPlaceholder(TextBox tb, string v)
    => tb.SetValue(PlaceholderProperty, v);
public static string GetPlaceholder(TextBox tb)
    => (string)tb.GetValue(PlaceholderProperty);
```

```xml
<TextBox local:TextBoxHelper.Placeholder="搜索"/>
```

## 五、路由事件

事件沿可视化树传播。

- **冒泡** Bubbling：从源向上（最常见）；
- **隧道** Tunneling：根向下（`Preview` 前缀）；
- **直接** Direct：只在源触发。

```xml
<Border PreviewMouseDown="Border_PreviewDown" MouseDown="Border_Down">
    <Button Click="Btn_Click">go</Button>
</Border>
```

可手动停止：`e.Handled = true;`。

## 六、资源

```xml
<Window.Resources>
    <SolidColorBrush x:Key="brand" Color="#4A90E2"/>
    <Style x:Key="primaryBtn" TargetType="Button">
        <Setter Property="Background" Value="{StaticResource brand}"/>
        <Setter Property="Foreground" Value="White"/>
    </Style>
</Window.Resources>
<Button Style="{StaticResource primaryBtn}" Content="OK"/>
```

`StaticResource`：编译期解析；`DynamicResource`：运行期查找，可热更换。

资源字典可外置：

```xml
<ResourceDictionary Source="/Themes/Dark.xaml"/>
```

应用全局：`App.xaml`。

## 七、样式

```xml
<Style TargetType="Button">
    <Setter Property="Padding" Value="12,6"/>
    <Setter Property="Margin" Value="4"/>
    <Style.Triggers>
        <Trigger Property="IsMouseOver" Value="True">
            <Setter Property="Background" Value="LightGray"/>
        </Trigger>
        <DataTrigger Binding="{Binding IsBusy}" Value="True">
            <Setter Property="IsEnabled" Value="False"/>
        </DataTrigger>
    </Style.Triggers>
</Style>
```

`Trigger`（属性）/ `DataTrigger`（绑定）/ `MultiTrigger` / `EventTrigger`（动画）。

## 八、控件模板（ControlTemplate）

完全重定义控件外观但保留行为：

```xml
<Style TargetType="Button">
    <Setter Property="Template">
        <Setter.Value>
            <ControlTemplate TargetType="Button">
                <Border Background="{TemplateBinding Background}"
                        CornerRadius="6" Padding="8,4">
                    <ContentPresenter HorizontalAlignment="Center"
                                      VerticalAlignment="Center"/>
                </Border>
            </ControlTemplate>
        </Setter.Value>
    </Setter>
</Style>
```

`TemplateBinding` 绑定到使用者属性。

## 九、数据模板（DataTemplate）

按数据类型决定如何渲染：

```xml
<DataTemplate DataType="{x:Type local:User}">
    <StackPanel Orientation="Horizontal">
        <Ellipse Width="20" Height="20" Fill="Gray"/>
        <TextBlock Text="{Binding Name}" Margin="4,0"/>
    </StackPanel>
</DataTemplate>
```

放进 `ItemsControl.ItemTemplate` 或全局资源里按类型匹配。

## 十、绑定深入

```xml
<TextBox Text="{Binding Name, Mode=TwoWay,
                       UpdateSourceTrigger=PropertyChanged,
                       StringFormat='Hello {0}',
                       FallbackValue='-',
                       TargetNullValue='(空)',
                       Delay=300}"/>
```

来源切换：

```xml
{Binding Path=...}                                                   <!-- DataContext -->
{Binding ElementName=tb, Path=Text}
{Binding RelativeSource={RelativeSource Self}, Path=ActualWidth}
{Binding RelativeSource={RelativeSource AncestorType=Window}, Path=Title}
{Binding Source={StaticResource user}, Path=Name}
```

`{x:Bind}`（UWP/WinUI）：编译期绑定，更快、类型安全。WPF 暂无原生。

## 十一、命令

`ICommand` + `Command`/`CommandParameter` 绑定；MVVM 详见对应文章。

内置：`ApplicationCommands.Copy`、`MediaCommands.Play` 等，配 `CommandBinding`。

## 十二、动画

```xml
<Button Content="hover">
    <Button.Triggers>
        <EventTrigger RoutedEvent="MouseEnter">
            <BeginStoryboard>
                <Storyboard>
                    <DoubleAnimation Storyboard.TargetProperty="Opacity"
                        From="1" To="0.3" Duration="0:0:0.2"/>
                </Storyboard>
            </BeginStoryboard>
        </EventTrigger>
    </Button.Triggers>
</Button>
```

类型：`DoubleAnimation` / `ColorAnimation` / `ThicknessAnimation` / 关键帧 `KeyFrame`。

C# 启动：

```csharp
var ani = new DoubleAnimation(0, 1, TimeSpan.FromSeconds(0.3));
ele.BeginAnimation(UIElement.OpacityProperty, ani);
```

## 十三、Dispatcher（UI 线程调度）

非 UI 线程更新 UI：

```csharp
Application.Current.Dispatcher.Invoke(() => label.Text = "x");
Application.Current.Dispatcher.InvokeAsync(() => ...);
Application.Current.Dispatcher.BeginInvoke(...);
```

DispatcherTimer：UI 线程定时器。

更常用：`async/await` 自动回到原上下文。

## 十四、性能要点

1. **`UI 虚拟化`**：`VirtualizingStackPanel`，大列表只渲染可见部分（`VirtualizingPanel.IsVirtualizing="True"`）；
2. **`ListView` 性能** > `DataGrid`；
3. **图片**：用 `DecodePixelWidth` 降采样大图；
4. **绑定调试**：`PresentationTraceSources.TraceLevel=High` 查看绑定细节；
5. **复杂模板**：用 `x:Shared="False"` 避免共享导致重绘；
6. **冻结**：`Freezable.Freeze()` 不可变后线程安全、性能更好（笔刷、几何）；
7. **避免过深视觉树**；
8. **测量 / 渲染**：用 `Snoop` / `Visual Studio Live Visual Tree` 调试。

## 十五、热门库

- **MaterialDesignInXamlToolkit** / **HandyControl** / **MahApps.Metro**：现代风格；
- **WPF UI**（lepoco）：Fluent / WinUI 风；
- **OxyPlot** / **LiveCharts2**：图表；
- **AvalonEdit**：代码编辑器；
- **Caliburn.Micro / Prism / CommunityToolkit.Mvvm**：MVVM；
- **Microsoft.Xaml.Behaviors.Wpf**：行为；
- **WPF-UI** / **ModernWpf**：主题与 UI 框架。

## 十六、与 WinForms / MAUI / Avalonia 对比

| 框架 | 渲染 | 跨平台 | XAML | 现状 |
|---|---|---|---|---|
| WinForms | GDI | Win | 否 | 维护 |
| WPF | DirectX | Win | 是 | 维护 + .NET 持续支持 |
| WinUI 3 | DirectX | Win | 是 | 新桌面，仍发展 |
| MAUI | 各平台原生 | iOS/Android/Mac/Win | 是 | 移动 + 桌面 |
| Avalonia | Skia | Win/Mac/Linux/iOS/Android/Web | 是 | 开源、活跃 |
| Uno Platform | 各平台 | 多 | 是 | 大型跨平台 |
