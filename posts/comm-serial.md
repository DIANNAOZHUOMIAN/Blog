---
title: 串口通信详解（RS-232 / 422 / 485）
date: 2026-06-11
tags: [通信, 串口, RS-232, RS-485, UART]
summary: UART 帧结构、电气标准、参数配置、C# SerialPort 实战、组帧与常见坑。
---

# 串口通信

工业、嵌入式、调试中最古老也最常见的接口。

## 一、UART 与电气标准

**UART**（Universal Asynchronous Receiver/Transmitter）是异步串行通信的逻辑层。**RS-232 / RS-422 / RS-485** 是电气层标准，决定电压、距离、拓扑。

| 标准 | 电压 | 信号 | 距离 | 拓扑 | 备注 |
|---|---|---|---|---|---|
| RS-232 | ±3~±15V | 单端，相对地 | ≤15m | 点对点 | PC COM 口 |
| RS-422 | 差分 ±2V | 一对发送 + 一对接收 | ≤1200m | 一主多从 | 全双工 |
| RS-485 | 差分 ±1.5V | 单对 | ≤1200m | 多点 | 半双工，最多 32/128 节点 |
| TTL UART | 0/3.3V 或 0/5V | 单端 | ≤几十厘米 | 点对点 | MCU 间直连 |

RS-485 需 120Ω 终端电阻（两端），长距离要双绞屏蔽线，注意接地共参考。

PC 上没有 RS-485 口 → 用 USB→RS-485 转换器（CH340/CP2102/FT232 等）。

## 二、UART 帧

```
空闲(高) | 起始位(0) | 数据位(LSB先,5~9) | 校验位(0/1) | 停止位(1/1.5/2) | 空闲
```

参数：
- **波特率**：每秒符号数，9600/19200/38400/57600/115200/230400/...；
- **数据位**：5/6/7/8/9（多数 8）；
- **校验位**：None / Odd / Even / Mark / Space；
- **停止位**：1 / 1.5 / 2；
- **流控**：None / RTS-CTS（硬件） / XON-XOFF（软件）。

帧间隔：异步通信无时钟，依靠停止位边沿同步。波特率漂移要 < 2%。

吞吐：8N1 下每字节传 10 位 → 115200 bps ≈ 11520 字节/秒。

## 三、C# SerialPort

`System.IO.Ports.SerialPort`：

```csharp
var sp = new SerialPort("COM3", 115200, Parity.None, 8, StopBits.One) {
    ReadTimeout  = 500,
    WriteTimeout = 500,
    NewLine = "\r\n",
    Handshake = Handshake.None,
    DtrEnable = true,
    RtsEnable = true,
    ReadBufferSize = 8192,
    WriteBufferSize = 8192,
};
sp.Open();
sp.DiscardInBuffer();   // 清缓冲
sp.DiscardOutBuffer();
sp.Write(new byte[]{0x01, 0x03}, 0, 2);
int n = sp.Read(buf, 0, buf.Length);
sp.Close();
```

### 端口枚举

```csharp
foreach (var name in SerialPort.GetPortNames())
    Console.WriteLine(name);

// 带描述（需 System.Management）
using var s = new ManagementObjectSearcher(
    "SELECT * FROM Win32_PnPEntity WHERE Caption LIKE '%(COM%'");
foreach (var d in s.Get())
    Console.WriteLine(d["Caption"]);
```

### 接收方式

#### 1. DataReceived 事件

```csharp
sp.DataReceived += (s, e) => {
    if (e.EventType != SerialData.Chars) return;
    int n = sp.BytesToRead;
    var buf = new byte[n];
    sp.Read(buf, 0, n);
    OnBytes(buf);
};
```

**陷阱**：`DataReceived` **不保证一次收完整帧**，可能 1 字节就触发。必须自己缓存 + 拼包。

事件回调在线程池线程，跨线程访问 UI 要 Dispatcher。

#### 2. 同步阻塞

```csharp
sp.ReadTimeout = 1000;
try {
    int b = sp.ReadByte();          // 0~255，-1 表示流末尾
    string line = sp.ReadLine();    // 按 NewLine
    int n = sp.Read(buf, 0, buf.Length);
} catch (TimeoutException) { }
```

#### 3. BaseStream + 异步（推荐）

```csharp
var stream = sp.BaseStream;
int n = await stream.ReadAsync(buf, ct);
await stream.WriteAsync(data, ct);
```

更现代，支持 `CancellationToken`，避免老 `SerialPort` 的事件不一致问题。

### 关闭注意

`SerialPort.Close()` 可能阻塞数秒（等待 DataReceived 回调结束）。建议：

```csharp
sp.DataReceived -= Handler;
sp.DiscardInBuffer(); sp.DiscardOutBuffer();
sp.Close();
sp.Dispose();
```

热插拔（USB 转串口）拔出时再 `Read` 会抛 `IOException`，要处理。

## 四、组帧（拼包）

字节流没有边界，应用层必须定帧。三种常见模式：

### 1. 固定长度

每帧固定 N 字节。最简单，无歧义。

### 2. 分隔符

如 NMEA `$GPRMC,...*CC\r\n`、AT 指令 `\r\n`。

```csharp
private readonly List<byte> _buf = new();
void OnBytes(byte[] data) {
    _buf.AddRange(data);
    while (true) {
        int idx = _buf.IndexOf((byte)'\n');
        if (idx < 0) break;
        var frame = _buf.GetRange(0, idx + 1).ToArray();
        _buf.RemoveRange(0, idx + 1);
        Process(frame);
    }
}
```

### 3. 长度前缀

帧头 + 长度字段 + 数据 + 校验：

```text
[SOF 0xAA][LEN 1B][CMD 1B][DATA LEN B][CRC 2B]
```

解析状态机：

```csharp
enum St { Sof, Len, Body, Crc }
St _st = St.Sof; int _len; List<byte> _body = new(); int _crc;

void Feed(byte b) {
    switch (_st) {
        case St.Sof:  if (b == 0xAA) { _st = St.Len; _body.Clear(); } break;
        case St.Len:  _len = b; _st = St.Body; break;
        case St.Body: _body.Add(b); if (_body.Count == _len) _st = St.Crc; break;
        case St.Crc:
            ushort wantCrc = Crc16(_body.ToArray());
            // 拼下一字节凑齐 2 字节 CRC...
            _st = St.Sof;
            break;
    }
}
```

工业协议多用 [4]。

## 五、校验

| 校验 | 说明 |
|---|---|
| 奇偶校验 | UART 自带，1 位，弱 |
| 校验和 | 累加取低字节 |
| LRC | Modbus ASCII，反码加 1 |
| **CRC-16** | Modbus RTU 常用，多项式 0x8005，初值 0xFFFF |
| CRC-32 | 以太网、ZIP |

CRC-16 Modbus 实现：

```csharp
public static ushort Crc16(ReadOnlySpan<byte> data) {
    ushort crc = 0xFFFF;
    foreach (var b in data) {
        crc ^= b;
        for (int i = 0; i < 8; i++)
            crc = (crc & 1) != 0 ? (ushort)((crc >> 1) ^ 0xA001) : (ushort)(crc >> 1);
    }
    return crc;   // 发送时低字节在前
}
```

## 六、收发模式（半/全双工）

RS-485 半双工，发送/接收用同一对差分线。需 **DE/RE** 控制收发方向：

- 普通方案：硬件自动方向控制（如 SP3485）；
- 软件方案：用 RTS 触发，但 Windows 下 `RtsEnable` 切换有延迟，高波特率丢字节。

发完最后一个字节要等 **TX 完成**才切回接收，否则截断尾字节。`SerialPort` 的 `BaseStream.Flush()` 不能完全保证；可以延时几 ms 或用更专业的驱动。

## 七、常见错误

| 现象 | 原因 |
|---|---|
| 收不到 | 端口不对、波特率不一致、TX/RX 接反、地线没接 |
| 乱码 | 波特率或数据位错、编码不一致（GB2312 vs UTF-8） |
| 偶发丢字节 | 缓冲过小、应用读取不及时、CPU 阻塞、`DataReceived` 处理慢 |
| 收不完整帧 | 没有组帧逻辑，认为 `Read` 一次返回完整帧 |
| 关闭卡死 | `DataReceived` 回调正在执行，先 `-=` 再 Close |
| 多设备同时发 | RS-485 总线冲突；做主从轮询，从机不主动发 |
| 长距离失稳 | 没加 120Ω 终端电阻 / 屏蔽不好 / 共地不一致 |

## 八、性能与并发

- 高波特率开 `BaseStream` 异步，事件模式更易丢；
- 单端口收发要做发送队列：写完再读，避免半双工冲突；
- 一个端口 = 一个对象，禁止多线程同时调用 `Write`；
- 线程池任务回 UI 用 `Dispatcher`/`SynchronizationContext`/`await`。

## 九、跨平台

`System.IO.Ports` .NET Core 在 Linux 工作（依赖 termios），但 USB 串口设备拔插事件、控制线行为差异大。跨平台首选：

- **SerialPortStream**（开源）：抽象更干净，跨平台稳定；
- **System.IO.Ports**：简单够用；
- Linux 设备名：`/dev/ttyUSB0` / `/dev/ttyACM0`。

## 十、调试工具

- 串口助手（友善串口、SSCOM、SecureCRT、PuTTY、Tera Term）；
- USB 协议分析仪 / 串口监视器；
- 自带回环测试：短接 TX-RX，发什么收什么；
- Saleae / DSLogic 逻辑分析仪看波形；
- Wireshark 串口插件。

## 十一、检查清单

- 收数据必须组帧，不能假设一次收完；
- 不要在 `DataReceived` 里阻塞耗时操作；
- 大量发送排队 / 加节流；
- 关闭前 `-=` 事件 + 清缓冲；
- 配 CRC 校验，丢弃错帧；
- RS-485 注意半双工方向与终端电阻；
- 跨线程访问 UI 切回 UI 上下文；
- 使用 `BaseStream` + `async` 写新代码；
- 异常处理：拔线、超时、缓冲满。
