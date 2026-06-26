---
title: Prism（WPF MVVM 框架）
date: 2026-06-14
tags: [C#, Prism, WPF, MVVM]
summary: Prism 上手：PrismApplication、BindableBase、DelegateCommand、Region、导航、模块化、依赖注入、EventAggregator 与对话框服务。
---

# Prism

Prism 是 WPF / Uno / MAUI 上最成熟的 MVVM 框架（作者 Brian Lagunas）。相比轻量的 CommunityToolkit.Mvvm，它多了**模块化、区域（Region）、导航、对话框服务**这一整套企业级应用骨架。本文按"能直接抄"的方式过一遍核心功能。

> 适用判断：单窗口小工具用 CommunityToolkit.Mvvm 足矣；多模块、多视图切换、需要插件式加载的中大型桌面应用，用 Prism。两者并不互斥——Prism 的 `BindableBase` 也可以配 Toolkit 的源生成器。

## 一、安装

按 DI 容器二选一（推荐 DryIoc，轻快）：

```bash
dotnet add package Prism.DryIoc      # 含 Prism.Wpf + Prism.Core
# 或
dotnet add package Prism.Unity
```

包结构：`Prism.Core`（与平台无关：BindableBase、DelegateCommand、EventAggregator）+ `Prism.Wpf`（Region、导航、对话框）+ 容器适配包。

## 二、应用入口 PrismApplication

删掉 `App.xaml` 里的 `StartupUri`，让 Prism 接管启动：

```xml
<!-- App.xaml -->
<prism:PrismApplication x:Class="MyApp.App"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    xmlns:prism="http://prismlibrary.com/">
    <Application.Resources/>
</prism:PrismApplication>
```

```csharp
// App.xaml.cs
public partial class App : PrismApplication
{
    // 指定主窗口（容器解析，自动注入）
    protected override Window CreateShell()
        => Container.Resolve<MainWindow>();

    // 注册服务与导航视图
    protected override void RegisterTypes(IContainerRegistry containerRegistry)
    {
        containerRegistry.RegisterSingleton<IUserService, UserService>();
        containerRegistry.RegisterForNavigation<HomeView, HomeViewModel>();
        containerRegistry.RegisterForNavigation<DetailView, DetailViewModel>();
        containerRegistry.RegisterDialog<ConfirmDialog, ConfirmDialogViewModel>();
    }

    // 注册模块（可选，见"模块化"）
    protected override void ConfigureModuleCatalog(IModuleCatalog moduleCatalog)
        => moduleCatalog.AddModule<OrderModule>();
}
```

## 三、BindableBase：属性通知

Prism 版的 `INotifyPropertyChanged` 基类，等价于 MVVM 笔记里的 `ViewModelBase`：

```csharp
public class HomeViewModel : BindableBase
{
    private string _title = "首页";
    public string Title
    {
        get => _title;
        set => SetProperty(ref _title, value);   // 变了才通知
    }

    private User _current;
    public User Current
    {
        get => _current;
        // 连带通知计算属性 + 刷新命令可用性
        set
        {
            if (SetProperty(ref _current, value))
                SaveCommand.RaiseCanExecuteChanged();
        }
    }
    public string Display => Current?.Name ?? "(无)";
}
```

## 四、DelegateCommand：命令

```csharp
public class HomeViewModel : BindableBase
{
    public DelegateCommand SaveCommand { get; }
    public DelegateCommand<string> DeleteCommand { get; }   // 带参数

    public HomeViewModel()
    {
        SaveCommand = new DelegateCommand(OnSave, CanSave)
            .ObservesProperty(() => Current)        // Current 变化自动重查 CanExecute
            .ObservesCanExecute(() => IsBusy);       // 也可直接观察一个 bool 属性

        DeleteCommand = new DelegateCommand<string>(id => Repo.Delete(id));
    }

    private bool _isBusy;
    public bool IsBusy { get => _isBusy; set => SetProperty(ref _isBusy, value); }

    private void OnSave() { /* ... */ }
    private bool CanSave() => Current != null;
}
```

XAML 绑定与原生 `ICommand` 一致：

```xml
<Button Content="保存" Command="{Binding SaveCommand}"/>
<Button Content="删除" Command="{Binding DeleteCommand}" CommandParameter="42"/>
```

异步命令：用 `DelegateCommand` 包一个 `async void`/`Task`，或自定义 `AsyncDelegateCommand`（Prism 9 已内置）。`ObservesProperty` 省掉手动 `RaiseCanExecuteChanged`。

## 五、ViewModelLocator：自动关联 VM

Prism 约定 `Views.XxxView` ↔ `ViewModels.XxxViewModel`，开启自动装配后无需手写 `DataContext`：

```xml
<UserControl x:Class="MyApp.Views.HomeView"
             xmlns:prism="http://prismlibrary.com/"
             prism:ViewModelLocator.AutoWireViewModel="True">
```

自定义约定（命名不规范时）：

```csharp
ViewModelLocationProvider.SetDefaultViewTypeToViewModelTypeResolver(viewType =>
{
    var name = viewType.FullName!.Replace(".Views.", ".VM.") + "Model";
    return Type.GetType(name);
});
```

## 六、Region：区域

把窗口划成若干"占位区"，由代码动态填充视图。这是 Prism 区别于普通 MVVM 的核心。

```xml
<!-- MainWindow.xaml -->
<DockPanel>
    <ContentControl prism:RegionManager.RegionName="MenuRegion"
                    DockPanel.Dock="Left" Width="200"/>
    <ContentControl prism:RegionManager.RegionName="ContentRegion"/>
</DockPanel>
```

支持的控件 → 区域类型：`ContentControl`（单视图）、`ItemsControl`（多视图列表）、`TabControl`（标签页）。

向区域注入视图：

```csharp
public class MainWindowViewModel
{
    public MainWindowViewModel(IRegionManager regionManager)
    {
        // 方式 A：直接塞一个视图实例
        regionManager.RegisterViewWithRegion("MenuRegion", typeof(MenuView));
        // 方式 B：按需导航（见下一节）
        regionManager.RequestNavigate("ContentRegion", "HomeView");
    }
}
```

## 七、导航

基于 Region + 注册名（`RegisterForNavigation`）实现视图切换，自带前进/后退日志。

```csharp
public class MenuViewModel : BindableBase
{
    private readonly IRegionManager _region;
    public DelegateCommand<string> GoCommand { get; }

    public MenuViewModel(IRegionManager region)
    {
        _region = region;
        GoCommand = new DelegateCommand<string>(Navigate);
    }

    private void Navigate(string target)
    {
        var p = new NavigationParameters { { "userId", 42 } };
        _region.RequestNavigate("ContentRegion", target, p);
    }
}
```

目标 VM 实现 `INavigationAware` 接收参数与控制复用：

```csharp
public class DetailViewModel : BindableBase, INavigationAware
{
    public void OnNavigatedTo(NavigationContext ctx)
    {
        var id = ctx.Parameters.GetValue<int>("userId");
        Load(id);
    }

    // 返回 true 则复用现有实例（不新建），常配合参数判断
    public bool IsNavigationTarget(NavigationContext ctx) => true;

    public void OnNavigatedFrom(NavigationContext ctx) { /* 离开时保存等 */ }
}
```

离开拦截（"有未保存内容，确定离开？"）用 `IConfirmNavigationRequest`：

```csharp
public void ConfirmNavigationRequest(NavigationContext ctx, Action<bool> cont)
    => cont(!IsDirty || AskUser());
```

回退/前进：

```csharp
_region.Regions["ContentRegion"].NavigationService.Journal.GoBack();
```

## 八、模块化（Module）

把功能拆成可独立开发、按需加载的模块。每个模块一个 `IModule`：

```csharp
public class OrderModule : IModule
{
    public void RegisterTypes(IContainerRegistry containerRegistry)
    {
        containerRegistry.RegisterForNavigation<OrderListView, OrderListViewModel>();
        containerRegistry.RegisterSingleton<IOrderService, OrderService>();
    }

    public void OnInitialized(IContainerProvider containerProvider)
    {
        // 模块加载完成后，往主区域挂个入口视图
        var region = containerProvider.Resolve<IRegionManager>();
        region.RegisterViewWithRegion("MenuRegion", typeof(OrderMenuView));
    }
}
```

注册方式：代码（`ConfigureModuleCatalog`，见入口）、配置文件、目录扫描（`DirectoryModuleCatalog` 实现插件式 DLL 热插拔）。按需加载用 `InitializationMode.OnDemand` + `IModuleManager.LoadModule("OrderModule")`。

## 九、依赖注入

Prism 用统一抽象 `IContainerRegistry` / `IContainerProvider` 包住 DryIoc / Unity：

```csharp
// 注册（生命周期）
containerRegistry.Register<IFoo, Foo>();             // 瞬时
containerRegistry.RegisterSingleton<IBar, Bar>();    // 单例
containerRegistry.RegisterScoped<IBaz, Baz>();       // 作用域
containerRegistry.RegisterInstance<IConfig>(cfg);    // 现成实例

// 解析（通常靠构造注入，少数场景手动）
var svc = containerProvider.Resolve<IUserService>();
var named = containerProvider.Resolve<IExporter>("pdf");  // 命名注册
```

VM 直接构造注入即可，Prism 通过 `ViewModelLocator` 解析时自动满足依赖：

```csharp
public DetailViewModel(IUserService users, IEventAggregator ea) { /* ... */ }
```

## 十、EventAggregator：跨模块解耦通信

发布/订阅，替代 VM 之间直接引用（类似 MVVM 笔记里的 Messenger）：

```csharp
// 1) 定义事件（载荷类型为泛型参数）
public class UserSelectedEvent : PubSubEvent<int> { }

// 2) 发布
_ea.GetEvent<UserSelectedEvent>().Publish(userId);

// 3) 订阅（可指定线程与过滤器）
_ea.GetEvent<UserSelectedEvent>().Subscribe(
    OnUserSelected,
    ThreadOption.UIThread,          // 回到 UI 线程
    keepSubscriberReferenceAlive: false,   // 弱引用，防泄漏（默认）
    filter: id => id > 0);          // 只收满足条件的

void OnUserSelected(int id) { /* ... */ }
```

记得在 `IDestructible.Destroy()` 里 `Unsubscribe`，或依赖弱引用默认行为。

## 十一、对话框服务

无需在 VM 里 `new Window`，保持可测试：

```csharp
// 对话框 VM 实现 IDialogAware
public class ConfirmDialogViewModel : BindableBase, IDialogAware
{
    public string Title => "确认";
    public DialogCloseListener RequestClose { get; }   // Prism 9；8 用 event

    public DelegateCommand<string> CloseCommand { get; }
    public ConfirmDialogViewModel()
        => CloseCommand = new DelegateCommand<string>(p =>
            RequestClose.Invoke(new DialogResult(
                p == "ok" ? ButtonResult.OK : ButtonResult.Cancel)));

    public bool CanCloseDialog() => true;
    public void OnDialogClosed() { }
    public void OnDialogOpened(IDialogParameters parameters)
        => Message = parameters.GetValue<string>("message");

    private string _message;
    public string Message { get => _message; set => SetProperty(ref _message, value); }
}
```

调用：

```csharp
public class HomeViewModel
{
    private readonly IDialogService _dialog;
    public HomeViewModel(IDialogService dialog) => _dialog = dialog;

    private void Ask()
    {
        var p = new DialogParameters { { "message", "确定删除？" } };
        _dialog.ShowDialog("ConfirmDialog", p, result =>
        {
            if (result.Result == ButtonResult.OK) DoDelete();
        });
    }
}
```

`Show` 非模态、`ShowDialog` 模态；窗口样式可通过 `IDialogWindow` 自定义。

## 十二、视图生命周期

| 接口 | 作用 |
|---|---|
| `INavigationAware` | 导航进入/离开回调、是否复用实例 |
| `IConfirmNavigationRequest` | 离开前确认（拦截导航） |
| `IRegionMemberLifetime` | `KeepAlive=false` 离开即销毁，回收内存 |
| `IActiveAware` | 视图激活/失活（TabControl 切换） |
| `IDestructible` | 视图被移除时清理（退订事件等） |

```csharp
public class DetailViewModel : BindableBase, IRegionMemberLifetime, IDestructible
{
    public bool KeepAlive => false;     // 不缓存，离开就释放
    public void Destroy() => _ea.GetEvent<UserSelectedEvent>().Unsubscribe(OnUserSelected);
}
```

## 十三、与 CommunityToolkit.Mvvm 对比

| 维度 | Prism | CommunityToolkit.Mvvm |
|---|---|---|
| 定位 | 应用框架（导航/模块/区域/对话框） | 轻量 MVVM 基础设施 |
| 属性/命令 | `BindableBase` / `DelegateCommand` | 源生成器 `[ObservableProperty]` / `[RelayCommand]` |
| 模板代码 | 较多（但有 ObservesProperty 简化） | 极少（编译期生成） |
| DI | 内置统一容器抽象 | 自带 `Ioc.Default`，或接 MS DI |
| 消息 | EventAggregator | WeakReferenceMessenger |
| 学习曲线 | 较陡 | 平缓 |
| 适合 | 多模块中大型桌面应用 | 中小应用 / 各端通用 |

可混用：Prism 负责导航/区域骨架，VM 属性用 Toolkit 的源生成器减少样板。

## 十四、常见坑

1. **忘了开 `AutoWireViewModel`**：`DataContext` 为空，绑定全失效；
2. **Region 名拼错 / 控件不支持**：导航无反应，检查 `RegionName` 与控件类型；
3. **`RegisterForNavigation` 漏注册**：`RequestNavigate` 目标名找不到；
4. **`IsNavigationTarget` 永远返回 true 又带参数**：复用了旧实例却不刷新数据，记得在 `OnNavigatedTo` 里按参数重载；
5. **EventAggregator 强引用订阅不退订**：内存泄漏，优先弱引用 + `Destroy()` 退订；
6. **对话框 VM 没注册 `RegisterDialog`**：`ShowDialog` 抛找不到异常；
7. **在 VM 里 `new Window` / 引用 View**：破坏可测试性，改用 `IDialogService` / 导航；
8. **Prism 8 → 9 API 变化**：`IDialogAware.RequestClose` 由事件改为 `DialogCloseListener`，升级时注意。
