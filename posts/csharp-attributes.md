---
title: C# 特性（Attribute）
date: 2026-06-11
tags: [C#, 特性, 反射]
summary: 特性本质、内置特性、自定义特性、反射读取、性能优化与源生成器替代。
---

# C# 特性

特性（Attribute）= 把元数据贴在程序元素上，运行/编译期可被读取。本质是一个普通类，继承自 `System.Attribute`。

## 一、语法基础

```csharp
[Serializable]
[Obsolete("用 NewClass 代替", error: false)]
public class Old { ... }

// 多重特性：可写多行或一行
[Range(0, 100), Required]
public int Age { get; set; }

// 指定目标
[assembly: AssemblyVersion("1.0.0.0")]
[return: NotNullIfNotNull(nameof(input))]
public string? F(string? input) => input;
```

可贴目标：`assembly / module / type / method / property / field / event / param / return / typeparam`。

## 二、内置常用特性

| 特性 | 作用 |
|---|---|
| `[Obsolete]` | 标记过时 |
| `[Serializable]` | 可二进制序列化 |
| `[NonSerialized]` | 字段不序列化 |
| `[DataContract]` / `[DataMember]` | WCF / DataContract 序列化 |
| `[JsonPropertyName]` / `[JsonIgnore]` | System.Text.Json |
| `[DllImport]` | P/Invoke 调用 Win32 |
| `[Conditional("DEBUG")]` | 仅条件编译时调用保留 |
| `[Flags]` | 枚举位标志 |
| `[MethodImpl(MethodImplOptions.AggressiveInlining)]` | 强制内联 |
| `[ThreadStatic]` | 每线程独立字段 |
| `[CallerMemberName]` / `[CallerFilePath]` / `[CallerLineNumber]` | 编译期注入调用者信息 |
| `[Required]` / `[Range]` / `[StringLength]` | 数据校验（DataAnnotations） |
| `[Table]` / `[Column]` / `[Key]` | EF 实体映射 |
| `[ApiController]` / `[Route]` / `[HttpGet]` | ASP.NET Core 路由 |
| `[Test]` / `[Fact]` / `[Theory]` | 单元测试发现 |

### 调用者信息特性

```csharp
public void Log(string msg,
    [CallerMemberName] string member = "",
    [CallerFilePath]   string file   = "",
    [CallerLineNumber] int    line   = 0)
{
    Console.WriteLine($"[{file}:{line} {member}] {msg}");
}
```

特别用于 `INotifyPropertyChanged`：

```csharp
protected void OnPropertyChanged([CallerMemberName] string name = "")
    => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
```

## 三、自定义特性

```csharp
[AttributeUsage(
    AttributeTargets.Class | AttributeTargets.Property,
    AllowMultiple = false,
    Inherited = true)]
public sealed class TableAttribute : Attribute {
    public string Name { get; }
    public string? Schema { get; set; }
    public TableAttribute(string name) { Name = name; }
}

[Table("user", Schema = "dbo")]
public class User {
    [Column("name", IsKey = false)]
    public string Name { get; set; } = "";
}
```

要点：
- 类名以 `Attribute` 结尾，使用时可省略；
- 构造函数参数 = 必填，公开属性 = 可选命名参数；
- `AttributeUsage` 描述自身的使用范围；
- 推荐 `sealed`（属性不应被继承覆盖）。

合法的特性参数类型：基元类型、`string`、`Type`、枚举、上述类型的一维数组。引用对象不能作为常量参数。

## 四、反射读取

```csharp
var t = typeof(User);
var tbl = t.GetCustomAttribute<TableAttribute>();
Console.WriteLine(tbl?.Name);

foreach (var p in t.GetProperties()) {
    var col = p.GetCustomAttribute<ColumnAttribute>();
    if (col != null) Console.WriteLine($"{p.Name} → {col.Name}");
}

// 是否定义
bool isObsolete = t.IsDefined(typeof(ObsoleteAttribute), inherit: true);

// 程序集级别
var asm = Assembly.GetExecutingAssembly();
var ver = asm.GetCustomAttribute<AssemblyVersionAttribute>();
```

`inherit: true` 时会沿类继承链查找。

## 五、典型用法 / 模式

### 1. ORM 映射

EF / SqlSugar 用特性标注表名、列名、主键、长度：

```csharp
[Table("orders")]
public class Order {
    [Key] [Column("id")] public long Id { get; set; }
    [Required] [StringLength(50)] public string Code { get; set; } = "";
    [NotMapped] public string Tmp { get; set; } = "";
}
```

### 2. 模型校验

```csharp
public class RegisterDto {
    [Required] [StringLength(20, MinimumLength = 3)]
    public string UserName { get; set; } = "";
    [EmailAddress] public string Email { get; set; } = "";
    [Range(0, 150)] public int Age { get; set; }
}

var ctx = new ValidationContext(dto);
var res = new List<ValidationResult>();
bool ok = Validator.TryValidateObject(dto, ctx, res, true);
```

### 3. 路由 / 控制器

```csharp
[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase {
    [HttpGet("{id:int}")]
    public ActionResult<User> Get(int id) { ... }
}
```

### 4. 依赖注入识别

```csharp
[AttributeUsage(AttributeTargets.Class)]
public class InjectableAttribute : Attribute {
    public ServiceLifetime Lifetime { get; set; } = ServiceLifetime.Scoped;
}

// 启动时扫描程序集
foreach (var t in Assembly.GetExecutingAssembly().GetTypes()) {
    var a = t.GetCustomAttribute<InjectableAttribute>();
    if (a != null)
        services.Add(new ServiceDescriptor(t, t, a.Lifetime));
}
```

### 5. AOP / 拦截

Castle DynamicProxy / DispatchProxy 可以用特性拦截方法，配合日志、缓存、事务。

## 六、性能与缓存

反射 + 特性慢。热路径必须缓存：

```csharp
private static readonly ConcurrentDictionary<Type, TableAttribute?> _cache = new();
public static TableAttribute? Table(Type t)
    => _cache.GetOrAdd(t, x => x.GetCustomAttribute<TableAttribute>());
```

更快方案：
1. **源生成器（Source Generator）**：编译期扫描特性生成代码，零运行期成本。`CommunityToolkit.Mvvm`、`System.Text.Json`、`Microsoft.Extensions.Logging` 都已迁移到这种方式；
2. **Expression Tree / IL Emit** 缓存委托：把反射调用编译成委托缓存起来。

## 七、易错点

- 特性参数只能是编译期常量，不能写 `new Guid(...)`；
- `Inherited = false` 时子类用 `GetCustomAttribute(inherit:true)` 也读不到；
- `[Conditional]` 标注的方法在条件未定义时调用会被编译器整段移除（连参数表达式都不执行），不要在里面写有副作用的表达式；
- `Enum.Flags` 必须把成员定义成 2 的幂；
- 特性贴在抽象成员上，运行时拿到的是子类成员，要 `GetCustomAttribute(method, true)`。

## 八、源生成器替代示例

`CommunityToolkit.Mvvm` 的 `[ObservableProperty]`：

```csharp
public partial class VM : ObservableObject {
    [ObservableProperty] private string _name = "";
    // 编译期自动生成：public string Name { get; set; } + OnPropertyChanged 调用
}
```

这就是特性 + 源生成器的现代写法，去掉反射开销，IDE 还能直接跳转生成的代码。
