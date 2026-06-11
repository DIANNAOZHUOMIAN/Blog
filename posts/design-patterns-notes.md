---
title: 设计模式十一讲（C# 版）
date: 2026-06-11
tags: [设计模式, C#, 笔记]
summary: 单例、工厂、抽象工厂、代理、建造者、依赖注入、观察者、迭代器、适配器、策略、桥接，意图、结构、代码与使用场景。
---

# 设计模式笔记

设计原则 SOLID：单一职责 (S)、开闭 (O)、里氏替换 (L)、接口隔离 (I)、依赖倒置 (D)。

## 一、单例（Singleton）

意图：保证一个类只有一个实例，并提供全局访问点。

```csharp
public sealed class Logger {
    private static readonly Lazy<Logger> _ins = new(() => new Logger());
    public static Logger Instance => _ins.Value;
    private Logger() { }
}
```

要点：
- `Lazy<T>` 自带线程安全 + 延迟加载；
- 避免可变全局状态，否则测试困难；
- 与 DI 容器配合时用 `AddSingleton`，不要自己写双重检查锁。

场景：日志、配置、缓存、连接池。

## 二、工厂方法（Factory Method）

意图：定义创建对象的接口，子类决定实例化哪个类。

```csharp
public abstract class Logistics {
    public void PlanDelivery() {
        var t = CreateTransport();
        t.Deliver();
    }
    protected abstract ITransport CreateTransport();
}
public class Road : Logistics { protected override ITransport CreateTransport() => new Truck(); }
public class Sea  : Logistics { protected override ITransport CreateTransport() => new Ship();  }
```

场景：日志器按类型创建、支付通道、文档解析器。

## 三、抽象工厂（Abstract Factory）

意图：创建一**族**相关对象，无需指定其具体类。

```csharp
public interface IUiFactory {
    IButton CreateButton();
    ICheckBox CreateCheckBox();
}
public class WinFactory : IUiFactory { ... }   // 一族 Windows 风格
public class MacFactory : IUiFactory { ... }   // 一族 Mac 风格
```

区别：工厂方法造**一个**，抽象工厂造**一族**。

场景：跨平台 UI、不同数据库的 SQL/连接/参数对象。

## 四、代理（Proxy）

意图：为对象提供一个替身，控制对它的访问。

```csharp
public interface IService { string Get(int id); }
public class RealService : IService { public string Get(int id) => "data"; }
public class CacheProxy : IService {
    private readonly IService _inner;
    private readonly Dictionary<int,string> _cache = new();
    public CacheProxy(IService s) { _inner = s; }
    public string Get(int id) =>
        _cache.TryGetValue(id, out var v) ? v
        : (_cache[id] = _inner.Get(id));
}
```

类型：远程代理（gRPC/WCF）、虚拟代理（懒加载）、保护代理（权限）、缓存代理、日志代理。

实现技术：静态代理、`DispatchProxy`、Castle DynamicProxy（AOP）。

## 五、建造者（Builder）

意图：将复杂对象的构建与表示分离，相同构建过程可创建不同表示。

```csharp
var http = new HttpClientBuilder()
    .BaseAddress("https://api.x")
    .Timeout(TimeSpan.FromSeconds(10))
    .Header("Authorization","Bearer ...")
    .Build();

// 链式 / Fluent
public class QueryBuilder {
    private readonly StringBuilder _sb = new("SELECT ");
    public QueryBuilder Select(params string[] cols)
        { _sb.Append(string.Join(",", cols)); return this; }
    public QueryBuilder From(string t) { _sb.Append($" FROM {t}"); return this; }
    public QueryBuilder Where(string cond) { _sb.Append($" WHERE {cond}"); return this; }
    public string Build() => _sb.ToString();
}
```

场景：复杂参数对象、SQL/URL/HTTP 请求拼装、DI/中间件链。

## 六、依赖注入（DI）

不是 GoF 模式，而是依赖倒置 (DIP) 的实现机制：对象不自己创建依赖，而由外部注入。

注入方式：构造函数（推荐）、属性、方法。

```csharp
public interface IRepo { User Get(int id); }
public class UserService {
    private readonly IRepo _repo;
    public UserService(IRepo repo) { _repo = repo; }   // 构造注入
}

// .NET 内置容器
var services = new ServiceCollection();
services.AddSingleton<IRepo, SqlRepo>();
services.AddScoped<UserService>();
services.AddTransient<IMailer, SmtpMailer>();
var sp = services.BuildServiceProvider();
var us = sp.GetRequiredService<UserService>();
```

生命周期：
- `Singleton`：进程一份；
- `Scoped`：一次请求/工作单元一份（Web 常用）；
- `Transient`：每次取都新建。

优点：解耦、可替换、便于单元测试（Mock）。

## 七、观察者（Observer）

意图：一对多依赖，被观察者状态变化时通知所有观察者。

C# 语言级原生支持：**事件**。

```csharp
public class Stock {
    public event Action<decimal> PriceChanged;
    private decimal _p;
    public decimal Price {
        get => _p;
        set { if (_p != value) { _p = value; PriceChanged?.Invoke(value); } }
    }
}

stock.PriceChanged += p => Console.WriteLine($"new {p}");
```

变种：发布订阅（中间有 Broker）、`IObservable<T>` / Reactive Extensions（Rx.NET）。

场景：UI 数据绑定、消息总线、行情推送。

## 八、迭代器（Iterator）

意图：顺序访问集合元素，无需暴露内部结构。

C# 用 `IEnumerable<T>` / `IEnumerator<T>` + `yield return`。

```csharp
public IEnumerable<int> Range(int n) {
    for (int i = 0; i < n; i++) yield return i;
}
foreach (var x in Range(5)) Console.WriteLine(x);

// 自定义集合
public class Tree<T> : IEnumerable<T> {
    public IEnumerator<T> GetEnumerator() { /* yield 遍历 */ }
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}
```

要点：`yield return` 编译为状态机，惰性求值，O(1) 内存。

异步迭代（C# 8+）：`IAsyncEnumerable<T>` + `await foreach`。

## 九、适配器（Adapter）

意图：把一个类的接口转换成客户期望的另一个接口。

```csharp
// 旧接口
public class LegacyXmlReader { public string ReadXml() => "<x/>"; }

// 客户期望
public interface IDataReader { string ReadJson(); }

// 适配器
public class XmlToJsonAdapter : IDataReader {
    private readonly LegacyXmlReader _l;
    public XmlToJsonAdapter(LegacyXmlReader l) { _l = l; }
    public string ReadJson() => XmlToJson(_l.ReadXml());
    private string XmlToJson(string xml) => "{}";
}
```

场景：旧库适配新接口、第三方 SDK 包装、不同协议互通。

## 十、策略（Strategy）

意图：定义一族可互换的算法，让它们的变化独立于使用者。

```csharp
public interface IDiscount { decimal Apply(decimal total); }
public class NoDiscount   : IDiscount { public decimal Apply(decimal t) => t; }
public class PercentOff   : IDiscount { public decimal Apply(decimal t) => t * 0.9m; }
public class FixedAmount  : IDiscount { public decimal Apply(decimal t) => t - 10; }

public class Order {
    private readonly IDiscount _d;
    public Order(IDiscount d) { _d = d; }
    public decimal Pay(decimal total) => _d.Apply(total);
}
```

效果：把 if/switch 替换成多态对象，新增策略不改原代码（OCP）。

场景：促销规则、排序算法、压缩算法、风控规则。

## 十一、桥接（Bridge）

意图：将抽象部分与实现部分分离，使它们可以独立变化。两个变化维度，避免类爆炸。

```csharp
// 实现维度
public interface IDrawApi { void DrawCircle(int x,int y,int r); }
public class GdiApi  : IDrawApi { /* GDI */ public void DrawCircle(int x,int y,int r){} }
public class WebGlApi: IDrawApi { /* WebGL */ public void DrawCircle(int x,int y,int r){} }

// 抽象维度
public abstract class Shape {
    protected IDrawApi Api;
    protected Shape(IDrawApi api) { Api = api; }
    public abstract void Draw();
}
public class Circle : Shape {
    private int _x,_y,_r;
    public Circle(int x,int y,int r,IDrawApi api):base(api){_x=x;_y=y;_r=r;}
    public override void Draw() => Api.DrawCircle(_x,_y,_r);
}
```

桥接 vs 适配器：桥接是设计前的分离，适配器是事后的兼容。
桥接 vs 策略：桥接是结构型（两条继承体系），策略是行为型（算法替换）。

## 速查表

| 类别 | 模式 | 一句话 |
|---|---|---|
| 创建型 | 单例 | 全局唯一实例 |
| 创建型 | 工厂方法 | 子类决定造什么 |
| 创建型 | 抽象工厂 | 造一族产品 |
| 创建型 | 建造者 | 一步步构造复杂对象 |
| 结构型 | 代理 | 替身控制访问 |
| 结构型 | 适配器 | 接口翻译 |
| 结构型 | 桥接 | 抽象与实现分离 |
| 行为型 | 观察者 | 一变多知 |
| 行为型 | 迭代器 | 统一遍历 |
| 行为型 | 策略 | 算法可替换 |
| —— | 依赖注入 | DIP 的落地手段 |
