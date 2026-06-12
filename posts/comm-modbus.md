---
title: Modbus 协议
date: 2026-06-11
tags: [通信, Modbus, 工业总线]
summary: RTU / ASCII / TCP 三种形态、4 区数据模型、功能码、报文解析、C# 实战与常见坑。
---

# Modbus

工业现场最广泛的应用层协议。1979 年 Modicon 公开，简单、开放、易实现。主从模式（Modbus TCP 改为 C/S）。

## 一、三种形态

| 形态 | 物理层 | 封装 | 校验 | 特点 |
|---|---|---|---|---|
| **RTU** | 串口（RS-485/RS-232） | 二进制 | CRC-16 | 工业现场最常见 |
| **ASCII** | 串口 | ASCII 文本 | LRC | 可读，少见 |
| **TCP** | 以太网 (502) | 二进制 + MBAP | 无（依赖 TCP） | 现代 SCADA |

帧间隔（RTU）：≥ 3.5 字符时间（不同波特率不同 ms 数）。低于 1.5 字符时间认为是同帧。

## 二、数据模型（4 区）

| 区 | 名 | 类型 | 读写 | 地址惯例 |
|---|---|---|---|---|
| 1 | 线圈 Coils | 1 bit | R/W | 00001-09999 |
| 2 | 离散输入 Discrete Inputs | 1 bit | R | 10001-19999 |
| 3 | 输入寄存器 Input Registers | 16 bit | R | 30001-39999 |
| 4 | 保持寄存器 Holding Registers | 16 bit | R/W | 40001-49999 |

要点：
- "0~9999" 是文档惯例，协议里实际地址从 **0** 开始（线圈地址 40001 → 协议地址 0）；
- 寄存器 16 bit 无符号 = 0~65535；
- 实数（float）、长整型 (int32) 占 2 个连续寄存器，存储顺序（字节序/字序）厂商不统一，要测试；
- 一次最多读 125 寄存器或 2000 线圈。

## 三、功能码

| 码 | 名 | 作用 |
|---|---|---|
| 0x01 | Read Coils | 读线圈 |
| 0x02 | Read Discrete Inputs | 读离散输入 |
| 0x03 | Read Holding Registers | 读保持寄存器（**最常用**） |
| 0x04 | Read Input Registers | 读输入寄存器 |
| 0x05 | Write Single Coil | 写单线圈（0xFF00=ON, 0x0000=OFF） |
| 0x06 | Write Single Register | 写单寄存器 |
| 0x0F | Write Multiple Coils | 写多线圈 |
| 0x10 | Write Multiple Registers | 写多寄存器 |
| 0x16 | Mask Write Register | 掩码写 |
| 0x17 | Read/Write Multiple Registers | 读写合一 |

异常码（功能码 + 0x80 表示异常）：

| 码 | 含义 |
|---|---|
| 01 | 非法功能 |
| 02 | 非法地址 |
| 03 | 非法数据 |
| 04 | 从机故障 |
| 05 | 确认 |
| 06 | 从机忙 |
| 0A/0B | 网关问题 |

## 四、RTU 报文

```text
[从站地址 1B][功能码 1B][数据 N B][CRC16 2B(低在前)]
```

例：从站 1，功能 03 读 40001 起 2 个寄存器：

```text
请求:    01 03 00 00 00 02 C4 0B
应答:    01 03 04 00 0A 00 14 5A 3D
         (地址 03 字节数 4 寄存器 1=10 寄存器 2=20 CRC)
```

异常：

```text
01 83 02 C0 F1     # 功能码 0x83=0x03|0x80, 异常码 02 非法地址
```

## 五、ASCII 报文

每字节转两个 ASCII 字符（`0~9 A~F`），帧首 `:`，尾 `\r\n`，校验 LRC（反码加 1）。

```text
:010300000002FA\r\n
```

可读但传输量翻倍，少用。

## 六、TCP 报文（MBAP）

```text
[事务ID 2B][协议ID 2B=0][长度 2B][单元ID 1B][功能码 1B][数据]
```

- **事务 ID**：客户端递增，请求/应答匹配；
- **协议 ID**：固定 0；
- **长度**：从单元 ID 算起的字节数；
- **单元 ID**：网关后挂多个 RTU 从站时区分（直连 TCP 设备常用 0xFF 或 1）；
- **无 CRC**：依赖 TCP 校验和。

例：

```text
00 01 00 00 00 06 01 03 00 00 00 02
TID  PID   LEN   UID FC ADDR    QTY
```

## 七、寄存器 / 字节序

32 位浮点存 2 寄存器（4 字节 ABCD），4 种存储方式：

| 名 | 字节序 |
|---|---|
| Big-Endian (ABCD) | 高字节在前 |
| Little-Endian (DCBA) | 低字节在前 |
| Big-Endian byte swap (BADC) | 字内交换 |
| Little-Endian byte swap (CDAB) | 字间交换（最常见 PLC 默认） |

接入新设备先读已知点位，反推顺序。

```csharp
float RegsToFloat(ushort hi, ushort lo, ByteOrder o) {
    byte[] b = o switch {
        ByteOrder.ABCD => new[]{ (byte)(hi>>8), (byte)hi, (byte)(lo>>8), (byte)lo },
        ByteOrder.DCBA => new[]{ (byte)lo, (byte)(lo>>8), (byte)hi, (byte)(hi>>8) },
        ByteOrder.CDAB => new[]{ (byte)(lo>>8), (byte)lo, (byte)(hi>>8), (byte)hi },
        ByteOrder.BADC => new[]{ (byte)hi, (byte)(hi>>8), (byte)lo, (byte)(lo>>8) },
        _ => throw new ArgumentException()
    };
    return BitConverter.ToSingle(b);   // 注意机器自身字节序
}
```

## 八、C# 实战

### NModbus（开源）

```csharp
using NModbus;
using System.IO.Ports;
using System.Net.Sockets;

// RTU
var sp = new SerialPort("COM3", 9600, Parity.None, 8, StopBits.One);
sp.Open();
var factory = new ModbusFactory();
var master = factory.CreateRtuMaster(sp);

ushort[] regs = master.ReadHoldingRegisters(slaveId:1, startAddr:0, numRegs:10);
master.WriteSingleRegister(1, 0, 1234);
master.WriteMultipleRegisters(1, 0, new ushort[]{1,2,3});
bool[] coils = master.ReadCoils(1, 0, 8);

// TCP
var tcp = new TcpClient("192.168.1.10", 502);
var tcpMaster = factory.CreateMaster(tcp);
var regs2 = tcpMaster.ReadHoldingRegisters(1, 0, 10);
```

### FluentModbus（异步）

```csharp
var client = new ModbusTcpClient();
client.Connect(new IPEndPoint(IPAddress.Parse("192.168.1.10"), 502));
short[] r = client.ReadHoldingRegisters<short>(unitId:1, startAddr:0, count:10);
client.WriteSingleRegister(1, 0, (short)1234);
```

### HslCommunication

国产，文档/示例多，支持西门子 S7、三菱、欧姆龙等多种 PLC + Modbus 一站式：

```csharp
var mb = new ModbusTcpNet("192.168.1.10", 502, station:1);
OperateResult con = mb.ConnectServer();
var rd = mb.ReadInt16("100", 10);
mb.WriteFloat("200", 3.14f);
```

### 自己造轮子（无依赖）

发送一帧并接收：

```csharp
byte[] BuildReadHolding(byte slave, ushort addr, ushort qty) {
    var buf = new byte[8];
    buf[0]=slave; buf[1]=0x03;
    buf[2]=(byte)(addr>>8); buf[3]=(byte)addr;
    buf[4]=(byte)(qty>>8);  buf[5]=(byte)qty;
    ushort crc = Crc16(buf.AsSpan(0,6));
    buf[6]=(byte)(crc & 0xFF); buf[7]=(byte)(crc>>8);
    return buf;
}
```

## 九、主从轮询

RTU 是严格主从：主轮询，从应答，从机不能主动发。多从设备地址（1~247）。

典型轮询周期：50~200 ms/从机。设备多时分组轮询、错峰。

## 十、Modbus TCP/IP 网关

把多个 RTU 从机接到一个 TCP 网关，客户端走 TCP，网关转 RTU。单元 ID 用 RTU 从站号。

## 十一、常见错误

| 现象 | 原因 |
|---|---|
| 超时 | 波特率/帧间隔/从站号不一致；线松；485 方向问题 |
| CRC 错 | 干扰、终端电阻缺失、波特率不准 |
| 异常码 02 | 地址不在范围内（注意 PLC 编号 vs 协议编号差 1） |
| 异常码 03 | 数据值非法 |
| 数据混乱 | 字节序/字序选错 |
| 偶发返回 0 | 同地址多人轮询，串口冲突 |
| TCP 卡 | 没设超时，连接断了不释放 |

## 十二、性能与并发

- RTU 单总线串行，多客户端必须排队；
- TCP 单连接可流水线（事务 ID 区分），但多数设备只串行处理；
- 大量寄存器分批读，但每次读取尽量打满（减少帧开销）；
- 异步 API + 超时 + 重试 + 限速；
- 重连：连接掉了自动恢复。

## 十三、安全

Modbus 无认证、无加密，明文。生产部署：
- 物理网段隔离；
- 防火墙仅放 502/串口；
- Modbus/TCP Security（RFC 8502，TLS + X.509）支持有限。

## 十四、检查清单

- 明确地址：PLC 寄存器号 vs 协议 0-base；
- 测一遍字节序；
- RTU 必须设合适的帧间超时 / 总超时；
- TCP 连接持久 + 心跳；
- 异常码分类处理；
- 多设备轮询节流；
- 上位机做缓存，UI 显示最新值即可；
- 库选择：原型 NModbus / 商用复杂 HslCommunication / 高性能 FluentModbus。
