---
title: C# 类与对象
date: 2026-06-23
tags: [C#, 面向对象, 封装]
summary: 类与对象、字段与属性、访问修饰符、封装、构造函数、this，以及面向对象的四大特性入门。
---

# C# 类与对象

- **类（Class）**：定义数据与行为的蓝图（模板）。
- **对象（Object）**：类的实例，用 `new` 创建的实实在在的个体。

```csharp
public class Person
{
    public string Name;
    public int Age;
    public void SayHi() => Console.WriteLine($"我是 {Name}");
}

Person p = new Person();          // 实例化
p.Name = "李四";                   // 对象.成员
p.SayHi();                         // 对象.方法()

// 对象初始化器：创建时直接赋值
var p2 = new Person { Name = "王五", Age = 32 };
```

## 一、访问修饰符

| 修饰符 | 可访问范围 |
|---|---|
| `public` | 所有地方 |
| `private` | 仅本类内部（成员默认） |
| `protected` | 本类及其子类 |
| `internal` | 同一程序集/项目内（类默认） |
| `protected internal` | 同程序集 **或** 派生类 |
| `private protected` | 同程序集**且**派生类 |

> 默认值：**类**默认 `internal`，**成员**默认 `private`。封装的核心思想——默认收紧，按需放开。

## 二、字段与属性

**字段（Field）**：存储数据的成员变量，一般私有、小驼峰 `_name`。
**属性（Property）**：访问器，本身不存数据，读写时执行 `get`/`set`，用来**保护字段**。

```csharp
public class Student
{
    private int _age;                  // 私有字段

    public int Age                     // 公开属性
    {
        get => _age;
        set
        {
            if (value < 0) throw new ArgumentException("年龄非法");
            _age = value;              // value 是隐式传入的新值
        }
    }
}
```

只有 `get` 没有 `set` 就是**只读属性**。属性名用大驼峰 `PascalCase`。

### 自动属性（语法糖）

不需要拦截逻辑时，编译器自动生成隐藏字段：

```csharp
public string Name { get; set; }            // 可读可写
public int Id { get; private set; }         // 外部只读，内部可写
public string City { get; init; }           // 只能在初始化时赋值（C# 9+）
public double Pi => 3.14159;                 // 只读计算属性（表达式体）
```

## 三、封装（Encapsulation）

封装 = **隐藏实现细节，只暴露受控接口**。

- 狭义：字段私有化，通过属性/方法对外提供受控访问。
- 广义：把复杂逻辑打包成可复用的方法/类，调用方只关心"做什么"，不关心"怎么做"。

```csharp
public class BankAccount
{
    public decimal Balance { get; private set; }   // 外部不能直接改余额

    public void Deposit(decimal amount)            // 只能通过受控方法
    {
        if (amount <= 0) throw new ArgumentException("金额必须为正");
        Balance += amount;
    }
}
```

## 四、构造函数

与类同名、无返回值，用于初始化对象。不写时编译器送一个无参构造；一旦自定义了带参构造，**无参构造需手动补回**。

```csharp
public class People
{
    public string Name { get; set; }
    public int Age { get; set; }

    public People() { }                            // 无参
    public People(string name, int age)            // 带参
        => (Name, Age) = (name, age);

    public People(string name) : this(name, 0) { } // this 调用其他构造，避免重复
}
```

### 主构造函数（C# 12+）

```csharp
public class Point(int x, int y)
{
    public int X { get; } = x;
    public int Y { get; } = y;
}
```

## 五、this 关键字

`this` 指向"当前对象"。局部变量与字段重名时用它消除歧义；访问本类其他成员时可省略。

```csharp
public class Box
{
    private int width;
    public Box(int width) => this.width = width;   // this.width 是字段，width 是参数
}
```

## 六、面向对象四大特性

| 特性 | 含义 | 关键字/手段 |
|---|---|---|
| 封装 | 隐藏细节，暴露接口 | 访问修饰符、属性 |
| 继承 | 复用与扩展父类 | `: 基类` |
| 多态 | 同一接口不同实现 | `virtual` / `override` |
| 抽象 | 提炼共性、约定契约 | `abstract` / `interface` |

继承与多态见 [C# 继承与多态](c-继承与多态.html)，抽象类与接口见 [C# 抽象类、接口、密封类、部分类](c-抽象类-接口-密封类-部分类.html)。

## 七、跨项目引用类

1. 在当前项目的"依赖项 / 引用"右键 → **添加项目引用** → 勾选目标项目；
2. 在文件顶部 `using 目标命名空间;` 即可使用其中的类。

---

**延伸阅读**：[类（C# 编程指南）](https://learn.microsoft.com/zh-cn/dotnet/csharp/fundamentals/types/classes)
