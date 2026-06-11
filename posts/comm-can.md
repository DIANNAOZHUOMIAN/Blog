---
title: CAN 总线详解
date: 2026-06-11
tags: [通信, CAN, 车载, 工业总线]
summary: 电气、帧结构、仲裁机制、错误处理、CAN FD、上层协议（CANopen / J1939 / OBD-II）、PC 工具与 SDK。
---

# CAN（Controller Area Network）

Bosch 1986 年为汽车设计的串行总线。差分信号、广播、ID 优先级仲裁、无主从。后扩展到工业、医疗、机器人。

## 一、电气与拓扑

- 双绞线差分：**CAN_H** 与 **CAN_L**；
- 总线两端各 120Ω 终端电阻；
- 显性电平（dominant，逻辑 0，差分约 2V）压过隐性电平（recessive，逻辑 1，差分约 0V）；
- 最大节点数：取决于驱动器（典型 30~110）；
- 距离 / 速率反比：
  | 速率 | 最大长度 |
  |---|---|
  | 1 Mbps | 40 m |
  | 500 kbps | 100 m |
  | 250 kbps | 250 m |
  | 125 kbps | 500 m |
  | 50 kbps | 1000 m |

## 二、帧格式

CAN 2.0A（标准帧，11 位 ID）：

```text
SOF | 11-bit ID | RTR | IDE | r0 | DLC | Data 0~8B | CRC 15+1 | ACK 2 | EOF 7
```

CAN 2.0B（扩展帧，29 位 ID）：标准帧 + 18 位扩展 ID。

| 字段 | 长度 | 说明 |
|---|---|---|
| SOF | 1 | 起始位（显性） |
| ID | 11/29 | 仲裁 ID（越小优先级越高） |
| RTR | 1 | 远程帧（请求别人发） |
| IDE | 1 | 扩展帧标志 |
| DLC | 4 | 数据长度 0~8 |
| Data | 0~8B | 数据 |
| CRC | 15+1 | CRC 校验 + 界定符 |
| ACK | 2 | 应答（其他节点正确接收会拉低） |
| EOF | 7 | 帧结束（7 隐性） |

### 帧种类

- **数据帧 Data Frame**：最常用，携带数据；
- **远程帧 Remote Frame**：请求别人发同 ID；
- **错误帧 Error Frame**：错误检测时发，6 个显性破坏帧；
- **过载帧 Overload Frame**：延迟下一帧。

## 三、仲裁

CAN 是**多主广播**，所有节点同时发送，靠 ID 仲裁谁能继续发：

1. 节点同时发送时，每比特和总线比较；
2. 自己发隐性（1）但总线是显性（0）→ 输给低 ID，立即停止发送，切换接收；
3. 优先级最高（ID 最小）的节点继续完成传输；
4. 没有冲突重传，输的节点等下一个空闲再发。

**优势**：无中央、无碰撞重发开销，确定性强；
**代价**：ID 设计要考虑实时性，关键报文 ID 必须小。

## 四、错误处理

CAN 控制器维护两个计数器：**TEC** (Transmit Error Counter)、**REC** (Receive Error Counter)。

状态机：
- **Error Active**（正常）；
- **Error Passive**：错误计数 > 127，仍可发送，但发错误时少干扰；
- **Bus Off**：TEC > 255，节点断开总线，需重启或等 128 × 11 隐性位恢复。

错误类型：位错误、填充错误（5 个相同位后必须填反位）、CRC 错、形式错、应答错。

## 五、CAN FD（Flexible Data Rate）

CAN 升级版（2012），保持物理层兼容：

- **可变速率**：仲裁段保持原速率，数据段可达 5~8 Mbps；
- **数据长度** 最大 64 字节（不只 8）；
- **改进 CRC**：15→17/21 位；
- 帧格式微调（BRS、ESI、FDF 位）。

要求节点全部支持 CAN FD；CAN 2.0 节点会进入 BusOff。

## 六、上层协议

CAN 只定义物理 + 数据链路层。应用层各家自定：

| 协议 | 行业 | 特点 |
|---|---|---|
| **CANopen** | 工业自动化 | 对象字典、SDO/PDO、NMT 状态机 |
| **SAE J1939** | 商用车（卡车） | 29 位 ID 自带 PGN、SPN，250kbps |
| **DeviceNet** | 工厂自动化 | Allen-Bradley，基于 CAN |
| **OBD-II** | 汽车诊断 | 11 位 ID，500 kbps，PID 查询 |
| **ISO-TP (ISO 15765-2)** | 汽车诊断 | CAN 上传输 > 8B，分段 |
| **UDS (ISO 14229)** | 汽车诊断 | 基于 ISO-TP 的诊断服务 |

CANopen 节点 ID（COB-ID） 7 位，常见 PDO/SDO 端口约定：

| COB-ID | 含义 |
|---|---|
| 0x000 | NMT 控制 |
| 0x080 | SYNC |
| 0x180-0x1FF | TPDO1 |
| 0x280-0x2FF | TPDO2 |
| 0x580+ID | SDO 应答 |
| 0x600+ID | SDO 请求 |
| 0x700+ID | NMT 心跳 |

J1939 用 PGN（Parameter Group Number），ID 内含目标 / 源地址 / 优先级。常见 PGN：发动机转速、车速、油耗。

## 七、PC 接入

需要 CAN 接口卡（USB / PCIe），常见厂商：

- **PEAK PCAN**：通用，pcanbasic.dll；
- **Vector VN16xx**：高端，CANalyzer/CANoe；
- **Kvaser**：跨平台支持好；
- **ZLG 周立功**：国产，性价比；
- **CANable / Innomaker**：低成本开源（slcan / candleLight）；
- **SocketCAN**（Linux 内核）：`can0` 像网卡一样使用。

## 八、Linux SocketCAN

```bash
sudo ip link set can0 type can bitrate 500000
sudo ip link set up can0
candump can0
cansend can0 123#1122334455667788
```

C 接口：

```c
int s = socket(PF_CAN, SOCK_RAW, CAN_RAW);
struct can_frame f = { .can_id=0x123, .can_dlc=4, .data={1,2,3,4} };
write(s, &f, sizeof(f));
read(s, &f, sizeof(f));
```

C# Linux：`SocketCANSharp` 或自己 P/Invoke。

## 九、Windows / .NET

通常用厂商 DLL P/Invoke 或 NuGet 封装。

### PCAN-Basic 示例（伪代码）

```csharp
using Peak.Can.Basic;

PCANBasic.Initialize(PCANBasic.PCAN_USBBUS1, TPCANBaudrate.PCAN_BAUD_500K);

// 发
var msg = new TPCANMsg {
    ID = 0x123,
    MSGTYPE = TPCANMessageType.PCAN_MESSAGE_STANDARD,
    LEN = 8,
    DATA = new byte[]{1,2,3,4,5,6,7,8}
};
PCANBasic.Write(PCANBasic.PCAN_USBBUS1, ref msg);

// 收（轮询）
var st = PCANBasic.Read(PCANBasic.PCAN_USBBUS1, out var rm, out var ts);
if (st == TPCANStatus.PCAN_ERROR_OK)
    Console.WriteLine($"ID={rm.ID:X3} DATA={BitConverter.ToString(rm.DATA, 0, rm.LEN)}");

// 收（事件）
PCANBasic.SetValue(PCANBasic.PCAN_USBBUS1,
    TPCANParameter.PCAN_RECEIVE_EVENT, BitConverter.GetBytes((uint)evt.SafeWaitHandle.DangerousGetHandle()), 4);

PCANBasic.Uninitialize(PCANBasic.PCAN_USBBUS1);
```

### HslCommunication / ZLG SDK

国产厂商都有 .NET 包装，类似套路：打开 → 发送 → 接收 → 关闭。

## 十、报文 ID 设计

- 高优先级周期性报文用小 ID（车控、刹车）；
- 大块数据 / 诊断用大 ID；
- 避免 ID 冲突（仲裁丢失但物理上是合法的，逻辑上语义会乱）；
- 文档化 DBC 文件（CAN 数据库），由 CANdb++/Kvaser DBC Editor 维护。

## 十一、调试工具

- **CANalyzer / CANoe**（Vector）：行业标准；
- **PCAN-View**（PEAK）：免费抓发；
- **BUSMASTER**（开源）；
- **SavvyCAN**（开源）；
- **candump / cansend**（SocketCAN）；
- 总线分析仪（示波器）看信号质量。

## 十二、常见坑

- 终端电阻只能两端各一个 120Ω，多个并联会变小；
- 节点波特率必须一致；
- 长距离用低速率；
- 共模电压超限烧驱动器；
- Bus Off：硬故障 / 速率错 / 接线短；
- 大数据用 ISO-TP，CAN 单帧 8 字节不能拆；
- 调试时一定先 Listen-Only / Bus Monitor 模式接入；
- 多个发送顺序不可预测（高 ID 节点饥饿要监控）。

## 十三、ISO-TP 分段（>8 字节）

帧类型：单帧 SF、首帧 FF、续帧 CF、流控帧 FC。

```text
SF: [0|len 4b][data 0~7]
FF: [1|len 12b][data 0~6]
CF: [2|sn 4b][data 0~7]
FC: [3|FS 4b][BS 1B][STmin 1B]
```

适用 OBD-II / UDS 诊断。

## 十四、检查清单

- 总线两端各 120Ω 终端电阻；
- 节点波特率一致、ID 唯一；
- 关键报文 ID 高优先级（小 ID）；
- 接收侧加错误计数监控、Bus Off 自恢复；
- 多帧数据走 ISO-TP；
- 量产前 DBC 文件评审；
- 仿真环境用 CANoe 跑回归；
- C# 选 PCAN/ZLG 厂商 SDK 直连，Linux 用 SocketCAN。
