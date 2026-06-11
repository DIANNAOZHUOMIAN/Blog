---
title: C# MVVM 模式详解
date: 2026-06-11
tags: [C#, MVVM, WPF]
summary: MVVM 三层职责、INotifyPropertyChanged、ICommand、Messenger、CommunityToolkit.Mvvm 与常见坑。
---

# C# MVVM

MVVM = Model - View - ViewModel。XAML 时代（WPF / UWP / MAUI / Avalonia）的事实标准。

## 一、三层职责

| 层 | 内容 | 不能依赖 |
|---|---|---|
| **Model** | 实体、领域服务、仓储 | View / VM |
| **ViewModel** | 视图状态 + 命令 + 交互逻辑 | View（不能 using View 命名空间） |
| **View** | XAML + 极少代码隐藏 | 业务逻辑 |

数据流：View ↔ VM 用绑定，VM ↔ Model 用方法/事件。

## 二、INotifyPropertyChanged

VM 必须实现：属性变了通知 View 重新读取。

```csharp
public class ViewModelBase : INotifyPropertyChanged {
    public event PropertyChangedEventHandler? PropertyChanged;

    protected bool SetProperty<T>(ref T field, T value,
        [CallerMemberName] string name = "") {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false;
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        return true;
    }
}

public class UserVm : ViewModelBase {
    private string _name = "";
    public string Name { get => _name; set => SetProperty(ref _name, value); }
}
```

`[CallerMemberName]` 让属性名自动注入。

## 三、ICommand

按钮等控件通过 `Command` 绑定，避免 `Click` 写代码隐藏。

```csharp
public class RelayCommand : ICommand {
    private readonly Action<object?> _exec;
    private readonly Func<object?, bool>? _canExec;
    public RelayCommand(Action<object?> exec, Func<object?, bool>? can = null) {
        _exec = exec; _canExec = can;
    }
    public bool CanExecute(object? p) => _canExec?.Invoke(p) ?? true;
    public void Execute(object? p) => _exec(p);
    public event EventHandler? CanExecuteChanged;
    public void Raise() => CanExecuteChanged?.Invoke(this, EventArgs.Empty);
}
```

WPF 还可以用 `CommandManager.RequerySuggested` 自动重查询。

异步命令：`AsyncRelayCommand`（CommunityToolkit 已提供）。

## 四、CommunityToolkit.Mvvm（推荐）

源生成器版本，零模板代码：

```csharp
public partial class UserVm : ObservableObject {
    [ObservableProperty]
    private string _name = "";              // 自动生成 Name 属性 + 通知

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FullName))]
    private string _firstName = "";

    public string FullName => $"{FirstName} {LastName}";

    [RelayCommand(CanExecute = nameof(CanSave))]
    private async Task SaveAsync() {
        await _repo.SaveAsync(/* ... */);
    }
    private bool CanSave() => !string.IsNullOrEmpty(Name);
}
```

源生成器编译期产出实际属性/命令代码，IDE 可跳转查看。

## 五、绑定模式

XAML：

```xml
<TextBox Text="{Binding Name, Mode=TwoWay,
                       UpdateSourceTrigger=PropertyChanged}"/>
<Button Command="{Binding SaveCommand}"
        CommandParameter="{Binding Id}"
        Content="保存"/>
<ItemsControl ItemsSource="{Binding Users}">
    <ItemsControl.ItemTemplate>
        <DataTemplate>
            <TextBlock Text="{Binding Name}"/>
        </DataTemplate>
    </ItemsControl.ItemTemplate>
</ItemsControl>
```

模式：`OneWay` / `TwoWay` / `OneTime` / `OneWayToSource` / `Default`。

`UpdateSourceTrigger`：`LostFocus`（默认）/`PropertyChanged`/`Explicit`。

## 六、数据上下文（DataContext）

整窗设置：

```csharp
public MainWindow() {
    InitializeComponent();
    DataContext = new MainVm();
}
```

或 XAML：

```xml
<Window.DataContext>
    <local:MainVm/>
</Window.DataContext>
```

子元素继承 DataContext，可用 `RelativeSource`、`ElementName` 切换：

```xml
<TextBlock Text="{Binding DataContext.Title,
                  RelativeSource={RelativeSource AncestorType=Window}}"/>
```

## 七、ObservableCollection

集合变化要通知 UI：

```csharp
public ObservableCollection<User> Users { get; } = new();

// 增删改
Users.Add(u); Users.Remove(u); Users.Clear();
```

注意：`ObservableCollection` 不是线程安全的，非 UI 线程修改要 `Dispatcher.Invoke` 或开启 `BindingOperations.EnableCollectionSynchronization`。

## 八、消息 / 弱事件

VM 之间避免直接引用，用消息中心：

```csharp
// CommunityToolkit.Mvvm
public class UserChangedMessage : ValueChangedMessage<User> {
    public UserChangedMessage(User u) : base(u) {}
}

// 发送
WeakReferenceMessenger.Default.Send(new UserChangedMessage(user));

// 接收
WeakReferenceMessenger.Default.Register<UserChangedMessage>(this, (r, m) => {
    var u = m.Value;
    /* 处理 */
});
```

`WeakReferenceMessenger` 弱引用订阅，避免内存泄漏。

## 九、依赖注入（IoC）

VM 不要 `new` 服务，构造注入：

```csharp
public partial class UserVm : ObservableObject {
    private readonly IUserService _svc;
    public UserVm(IUserService svc) { _svc = svc; }
}
```

DI 容器：`Microsoft.Extensions.DependencyInjection`。

## 十、值转换器（IValueConverter）

绑定时类型不一致：

```csharp
public class BoolToVisibility : IValueConverter {
    public object Convert(object v, Type t, object p, CultureInfo c)
        => (bool)v ? Visibility.Visible : Visibility.Collapsed;
    public object ConvertBack(object v, Type t, object p, CultureInfo c)
        => throw new NotSupportedException();
}
```

```xml
<Window.Resources><local:BoolToVisibility x:Key="b2v"/></Window.Resources>
<TextBlock Visibility="{Binding IsVip, Converter={StaticResource b2v}}"/>
```

## 十一、命令参数与多绑定

```xml
<Button Command="{Binding DelCmd}"
        CommandParameter="{Binding SelectedItem, ElementName=lst}"/>
```

`MultiBinding` + `IMultiValueConverter` 组合多个绑定源。

## 十二、设计时数据（d:DataContext）

XAML 设计器假数据：

```xml
xmlns:d="http://schemas.microsoft.com/expression/blend/2008"
mc:Ignorable="d"
d:DataContext="{d:DesignInstance Type=local:UserVm, IsDesignTimeCreatable=True}"
```

## 十三、导航

WPF：`Frame` + `Page`，或 VM-First 自己写 `INavigationService`：

```csharp
public interface INavigationService {
    void NavigateTo<TVm>() where TVm : class;
    void GoBack();
}
```

ContentControl + DataTemplate 实现 ViewModel-First：

```xml
<ContentControl Content="{Binding Current}">
    <ContentControl.Resources>
        <DataTemplate DataType="{x:Type local:HomeVm}"><local:HomeView/></DataTemplate>
        <DataTemplate DataType="{x:Type local:UserVm}"><local:UserView/></DataTemplate>
    </ContentControl.Resources>
</ContentControl>
```

## 十四、常见坑

1. **属性名拼错**：绑定失败但默认静默，看 Output 窗口的 BindingFailure；
2. **没实现 INotifyPropertyChanged**：UI 不刷新；
3. **集合用 `List<T>`**：改了 UI 不更新，要 `ObservableCollection<T>`；
4. **绑定到字段**：必须绑到属性；
5. **跨线程改集合**：抛 `NotSupportedException`，要 dispatcher 或集合同步；
6. **泄漏**：长寿命 VM 订阅事件不取消，或 Messenger 用强引用；
7. **VM 引用 View**：违反分层，难单测；
8. **过度命令化**：简单的 IsXxx 切换走属性更直观。

## 十五、单元测试

VM 不依赖 View，可直接 new 测：

```csharp
[Fact]
public async Task Save_Should_Call_Service() {
    var svc = Substitute.For<IUserService>();
    var vm = new UserVm(svc) { Name = "alice" };
    await vm.SaveCommand.ExecuteAsync(null);
    await svc.Received(1).SaveAsync(Arg.Any<User>());
}
```

## 十六、框架对比

| 框架 | 包 | 特点 |
|---|---|---|
| CommunityToolkit.Mvvm | MS 维护 | 源生成器、轻量、现代 |
| Prism | Brian Lagunas | 模块化、导航、Region |
| ReactiveUI | RX-based | 函数式、强约束 |
| Stylet | 轻量 | View-First |
| Caliburn.Micro | 老牌 | 约定优先 |

新项目首选 CommunityToolkit.Mvvm。
