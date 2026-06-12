---
title: C# 委托
date: 2026-06-11
tags: [C#, 委托, Delegate]
summary: 委托的本质、Func/Action/Predicate、多播、闭包陷阱与函数式应用。
---

# C# 委托

委托（Delegate）= **类型安全的函数指针**。把方法当作对象传递。

## 一、定义与基本用法

```csharp
// 自定义委托类型
public delegate int Calc(int a, int b);

int Add(int a, int b) => a + b;
Calc c = Add;
Console.WriteLine(c(1, 2));   // 3

// Lambda 也是委托
Calc mul = (a, b) => a * b;
```

委托底层是继承 `System.MulticastDelegate` 的类，持有方法指针 + this 引用（实例方法）。

## 二、内置泛型委托

不要自定义委托，优先用：

| 名称 | 签名 | 用途 |
|---|---|---|
| `Action` | `void()` | 无参无返回 |
| `Action<T>` | `void(T)` | 单参 |
| `Action<T1,...,T16>` | 多参 | 多参无返回 |
| `Func<TResult>` | `TResult()` | 无参有返回 |
| `Func<T,TResult>` | `TResult(T)` | 单参有返回 |
| `Func<T1,...,T16,TResult>` | 多参有返回 |
| `Predicate<T>` | `bool(T)` | 谓词 |
| `Comparison<T>` | `int(T,T)` | 比较器 |
| `EventHandler` | `void(object?, EventArgs)` | 事件 |
| `EventHandler<TArgs>` | `void(object?, TArgs)` | 事件 |

```csharp
Action<string> log = Console.WriteLine;
Func<int,int,int> add = (a,b) => a+b;
Predicate<int> pos = x => x > 0;

List<int> list = new(){1,-2,3};
list.RemoveAll(pos);            // 接受 Predicate<int>
```

## 三、多播委托

委托可以串联多个方法，按注册顺序依次调用：

```csharp
Action a = () => Console.Write("1");
a += () => Console.Write("2");
a += () => Console.Write("3");
a();                            // 123

// 移除
a -= someHandler;
```

注意：
- 有返回值的多播委托，只能拿到最后一个返回值，要拿全部得 `GetInvocationList`：
  ```csharp
  foreach (Func<int,int> f in func.GetInvocationList()) {
      int r = f(input);
      ...
  }
  ```
- 多播委托是不可变的，`+=`/`-=` 都返回新实例；
- 抛异常时后续注册的方法不会执行，需要包 try/catch 自己迭代调用。

## 四、委托相等

两个委托相等当且仅当：目标对象相同 + 方法相同。

```csharp
Action a = obj.M;
Action b = obj.M;
Console.WriteLine(a == b);   // True
```

注意：每次写 `obj.M` 会创建新的委托实例，但 `==` 比较值相等。

## 五、Lambda 与闭包

Lambda 捕获外部变量 = 闭包。编译器把捕获的变量提升到生成类的字段：

```csharp
int seed = 10;
Func<int,int> add = x => x + seed;
seed = 100;
Console.WriteLine(add(1));   // 101，捕获的是变量本身
```

### 经典陷阱：循环变量捕获

```csharp
var fs = new List<Action>();
for (int i = 0; i < 3; i++)
    fs.Add(() => Console.Write(i));
fs.ForEach(f => f());   // 输出 333（C# 5 之前）
```

C# 5+ `foreach` 已修复（每次新建作用域），但 `for` 仍要拷贝：

```csharp
for (int i = 0; i < 3; i++) {
    int copy = i;
    fs.Add(() => Console.Write(copy));   // 输出 012
}
```

## 六、委托与方法组

```csharp
button.Click += OnClick;                  // 方法组转委托（推断）
button.Click += (s, e) => OnClick(s, e);  // Lambda
button.Click -= OnClick;                  // 反向取消，必须传同一个目标
```

注意：传 Lambda 到 `-=` 通常无法取消（每次 lambda 都是新实例）。要么保存 lambda 引用，要么用方法组。

## 七、异步委托

历史 APM 模式：`delegate.BeginInvoke / EndInvoke`，**.NET Core 已移除**。现代方式：

```csharp
Func<int, Task<int>> work = async x => { await Task.Delay(100); return x*2; };
int r = await work(10);

// 或 Task.Run 包装同步委托
Func<int,int> sync = x => x * 2;
int r2 = await Task.Run(() => sync(10));
```

## 八、函数式应用

### 1. 策略 / 回调

```csharp
public void Process(IEnumerable<int> data, Func<int,bool> filter, Action<int> onMatch) {
    foreach (var x in data) if (filter(x)) onMatch(x);
}

Process(arr, x => x > 0, Console.WriteLine);
```

### 2. 高阶函数

```csharp
Func<int,int> AddN(int n) => x => x + n;
var add5 = AddN(5);
Console.WriteLine(add5(10));   // 15
```

### 3. 函数组合

```csharp
public static Func<T,R2> Then<T,R1,R2>(this Func<T,R1> f, Func<R1,R2> g)
    => x => g(f(x));

Func<string,int> len = s => s.Length;
Func<int,bool> big = n => n > 5;
var bigStr = len.Then(big);
Console.WriteLine(bigStr("hello world"));   // True
```

## 九、委托 vs 接口

| 场景 | 选择 |
|---|---|
| 单方法行为参数化 | 委托（更轻便） |
| 一组相关行为 | 接口 |
| 跨语言互操作 | 接口 |
| 高频调用、性能敏感 | 委托（直接调用）或接口 + 泛型避免装箱 |

## 十、性能与陷阱

1. **委托分配**：每次 `=>` 创建新实例。热路径要缓存：
   ```csharp
   private static readonly Func<int,int> _doubler = x => x * 2;
   ```
2. **闭包分配**：捕获变量会生成堆对象。无捕获 lambda 是静态方法，零分配；
3. **`EventHandler` 不能为 null** 在 `?.Invoke(...)` 前不要直接调用；多线程下要本地拷贝：
   ```csharp
   var h = SomethingHappened;
   h?.Invoke(this, e);
   ```
4. **委托链与异常**：异常会中断后续调用，写自定义触发器；
5. **GC / 内存泄漏**：长寿对象订阅短寿对象的事件，导致后者无法回收。要么及时 `-=`，要么用弱事件模式。
