---
title: C# 继承与多态
date: 2026-06-23
tags: [C#, 面向对象, 继承, 多态]
summary: 继承规则、重写 vs 重载、向上/向下转型、virtual/override/new、构造顺序、静态构造、单例（懒汉/饿汉）。
---

# C# 继承与多态

## 一、继承

继承让子类**复用并扩展**父类的成员，减少重复，代价是耦合度上升。

```csharp
class Father
{
    public double Money { get; set; }
    public virtual void MakeMoney() => Console.WriteLine("体力劳动");
}

class Son : Father                              // 用 : 继承
{
    public override void MakeMoney() => Console.WriteLine("脑力劳动");
}
```

规则：

- C# 是**单继承**（一个类只能有一个直接父类），但可层层传递，也可实现多个接口。
- 子类不能直接访问父类的 `private` 成员，可通过公开属性/方法间接访问。
- 构造子类时会**先执行父类构造函数**，再执行子类构造函数。

```csharp
class Son : Father
{
    public Son(double money) : base(money) { }  // base 调用父类构造
}
```

## 二、重写 vs 重载

| | 重写 Override | 重载 Overload |
|---|---|---|
| 位置 | 子类覆盖父类方法 | 同一个类内 |
| 方法名 | 相同 | 相同 |
| 参数列表 | **相同** | **不同** |
| 关键字 | 需 `virtual` + `override` | 无 |
| 多态 | 运行时多态 | 编译时多态 |

```csharp
// 重载：同名不同参
int Add(int a, int b) => a + b;
double Add(double a, double b) => a + b;

// 重写：见上面 Father/Son
```

## 三、多态

**多态 = 父类引用指向子类实例，运行时调用子类的实现。** 这让"对扩展开放、对修改封闭"成为可能。

```csharp
Father person = new Son();   // 向上转型，自动
person.MakeMoney();          // 输出"脑力劳动"——运行时决定调用 Son 的版本
```

典型用法：形参或返回值声明为父类型，运行期再决定具体子类行为。

```csharp
void FeedPet(Pet pet) => pet.Play();   // 传 Cat 或 Dog 都行
```

## 四、类型转换：向上 / 向下

```csharp
// 向上转型（子→父）：自动、安全；子类新增成员会被"隐藏"
Pet pet = new Dog();

// 向下转型（父→子）：需强制，且应先判型，否则可能 InvalidCastException
if (pet is Dog dog)            // C# 模式匹配：判型 + 赋值一步到位
    dog.Bark();

var cat = pet as Cat;          // as：失败返回 null 而非抛异常
if (cat != null) { }
```

## 五、virtual / override / new

- `virtual` + `override`：**多态**，父类引用调用到子类实现。
- `new`：仅**隐藏**父类成员，按变量的"声明类型"决定调谁——容易误导，少用。

```csharp
class A { public virtual void F() => Console.WriteLine("A.F"); }
class B : A { public override void F() => Console.WriteLine("B.F"); }
class C : A { public new void F() => Console.WriteLine("C.F"); }

A b = new B(); b.F();   // B.F（override，看实际类型）
A c = new C(); c.F();   // A.F（new，看声明类型）—— 容易踩坑
```

## 六、静态构造函数

无修饰符、无参数，在**首次访问类型前自动执行一次**，常用于初始化静态字段。

```csharp
class Student
{
    public static string Classroom { get; private set; }
    static Student() => Classroom = "208教室";   // 只跑一次，线程安全
}
```

## 七、私有构造与单例模式

私有构造函数阻止外部 `new`，配合静态成员实现**单例**（全局唯一实例）。

**懒汉式**——首次用到才创建：

```csharp
class Leader
{
    private static Leader? _instance;
    private Leader() { }
    public static Leader Instance => _instance ??= new Leader();
}
```

**饿汉式**——类型加载时就创建，天然线程安全：

```csharp
class Leader
{
    private static readonly Leader _instance = new Leader();
    private Leader() { }
    public static Leader Instance => _instance;
}
```

> 懒汉式在多线程下需加锁（或用 `Lazy<T>`）；饿汉式简单且线程安全，是大多数场景的首选。单例属于创建型设计模式，详见 [设计模式速记](设计模式十一讲-c-版.html)。

## 速记

- `virtual + override` = 运行时多态；`new` 只隐藏，看声明类型，慎用。
- 先 `is`/`as` 判型再向下转，避免异常。
- 构造顺序：父类构造 → 子类构造；`base(...)` 显式选父类构造。
- 单例三要素：私有构造、静态实例、静态访问入口。

---

**延伸阅读**：[继承（C# 编程指南）](https://learn.microsoft.com/zh-cn/dotnet/csharp/fundamentals/object-oriented/inheritance) · [多态性](https://learn.microsoft.com/zh-cn/dotnet/csharp/fundamentals/object-oriented/polymorphism)
