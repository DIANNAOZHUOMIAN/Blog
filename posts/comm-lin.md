---
title: LIN 总线详解
date: 2026-06-11
tags: [通信, LIN, 车载, 总线]
summary: LIN 物理层、帧结构、调度表、节点角色、与 CAN 的关系、PC 接入与典型应用。
---

# LIN（Local Interconnect Network）

汽车低成本辅助总线。1999 年发布，作为 CAN 的低端补充，用于车窗、座椅、空调按键、车镜调节、雨刷电机等不需要 CAN 速率/可靠性的子网。

## 一、定位

- 单线（与地形成回路）；
- 单主多从（最多 16 从节点）；
- 最高 20 kbps；
- 最长 40 m；
- 无总线仲裁，主节点轮询；
- 节点便宜：无需高精度晶振（从节点用主节点同步）；
- 当前主流：**LIN 2.x**（2003+）、**ISO 17987**（2016）。

经济模型：CAN 节点 ≈ 几美元 / 个，LIN 节点 ≈ 几十美分 / 个。一辆车可能有 1~3 条 CAN，但十几条 LIN 子网挂在每个 ECU 下做局部控制。

## 二、物理层

- 物理介质：单根铜线（典型 12V 系统）；
- 显性 0：低电平 (≤0.2 × Vbat)；
- 隐性 1：高电平 (≥0.8 × Vbat)；
- 速率：1.0~20 kbps 任选，常用 9.6 / 10.4 / 19.2 kbps；
- 主节点的 master pull-up：1kΩ 串电阻 + 二极管；
- 从节点：30 kΩ pull-up；
- 总线驱动：ISO 9141 兼容（K-Line 类似）。

## 三、帧结构

```text
[Header (主发)] [Response (主或从发)]
Header  = Break(≥13bit 显性) + Sync(0x55) + PID(1B)
Response= Data(1~8B) + Checksum(1B)
```

### PID（Protected Identifier）

```text
| P1 P0 ID5 ID4 ID3 ID2 ID1 ID0 |
```

- ID 6 位（0~63）；
- P0、P1 由 ID 算出的奇偶位（保护）。

### 帧分类（按 ID 段）

| ID 范围 | 类型 |
|---|---|
| 0x00~0x3B | 信号承载帧（应用数据） |
| 0x3C | 主请求帧（诊断） |
| 0x3D | 从应答帧（诊断） |
| 0x3E~0x3F | 保留 |

### 校验和

- **Classic Checksum**：对 Data 字节累加；
- **Enhanced Checksum**（LIN 2.0+）：包含 PID 一起累加，反码。

帧 0x3C / 0x3D 必须用 classic 校验。

## 四、节点角色

- **Master**：1 个。负责调度（决定何时发什么 ID）；
- **Slaves**：多个。响应主节点指定的 ID，发送 / 接收数据。

主节点 = 调度 + 收发；从节点 = 仅响应自己负责的 ID。

```text
主发 Header → 由 ID 决定哪个节点发 Response
            ├── 主节点自己发 → "MasterRequest"
            ├── 某从节点发 → 普通数据帧
            └── 主节点广播让所有节点接收
```

## 五、调度表（Schedule Table）

主节点按表周期轮询（典型 5/10/15/20 ms 槽位）：

```
slot 0: ID 0x21
slot 1: ID 0x22
slot 2: ID 0x3C (诊断)
...
```

每个 slot 时长固定（包含最坏情况帧时间）。从节点必须能在指定 slot 内回。

LIN 2.x 引入"调度表切换"，可在正常运行 / 诊断 / 睡眠唤醒等模式间切换调度表。

## 六、睡眠与唤醒

主节点发送 ID 0x3C + 数据 [0x00, 0xFF, ...] → "go-to-sleep" 命令，所有节点进入低功耗。

唤醒：任意节点拉低总线 ≥ 250µs，主节点重启调度。

LIN 设计上要求低功耗静态电流 < 100 µA，整车电池友好。

## 七、配置文件（LDF）

LIN Description File，类似 CAN 的 DBC：

```
LIN_description_file ;
LIN_protocol_version = "2.2" ;
LIN_language_version = "2.2" ;
LIN_speed = 19.2 kbps ;
Nodes {
    Master: MasterNode, 5 ms, 0.5 ms ;
    Slaves: SlaveA, SlaveB ;
}
Signals { ... }
Frames {
    Frame_A: 0x10, MasterNode, 8 {
        Sig1, 0 ;  Sig2, 8 ;
    }
}
Schedule_tables {
    Normal {
        Frame_A delay 10 ms ;
        Frame_B delay 10 ms ;
    }
}
```

工具：Vector LDF Explorer、ETAS、ldfconfigurator。

## 八、CAN vs LIN 对比

| 项 | CAN | LIN |
|---|---|---|
| 介质 | 双绞差分 | 单线 |
| 速率 | 1 Mbps（FD 更高） | 20 kbps |
| 拓扑 | 多主广播 | 单主多从 |
| 节点 | 110+ | 16 |
| 仲裁 | ID 优先级 | 主节点调度 |
| 确定性 | 受仲裁影响 | 完全确定（调度表） |
| 成本 | 高 | 低 |
| 长度 | 40m@1M / 1km@10k | 40m |
| 唤醒 | 总线唤醒 | 任意节点拉低 |
| 应用 | 动力、底盘、车身主干 | 车身辅助（车窗、镜、座椅） |

典型架构：CAN 主干 ↔ 网关 ↔ 各 LIN 子网。

## 九、PC 接入

工具厂商通常 CAN/LIN 一体：

- **Vector VN16xx / VN1530**：CAN + LIN 多通道；
- **PEAK PLIN-USB**：LIN 专用；
- **Kvaser** 部分型号支持 LIN；
- **ETAS** 系列；
- **国产**：ZLG / 创智能等。

PCAN-Basic 的 LIN 兄弟 `PLIN-API` 提供调度表加载、帧收发、诊断功能。SDK 用法与 CAN 类似：打开通道 → 加载调度 → 发送/接收。

```csharp
PLinApi.SetSchedule(client, hardware, scheduleId, slots);
PLinApi.StartSchedule(client, hardware, scheduleId);
PLinApi.Write(client, hardware, ref msg);
```

## 十、应用层 / 诊断

车身领域常用：
- **车窗**：主控发"升/降"命令，电机模块返回位置；
- **后视镜**：折叠、加热、调向；
- **空调风门电机**；
- **氛围灯 / 内饰灯**：状态广播；
- **雨量传感器**：周期上报。

诊断走 ID 0x3C/0x3D，规则与 UDS（ISO 14229）部分共用。

## 十一、常见问题

| 现象 | 原因 |
|---|---|
| 从机不响应 | 波特率不匹配、未加载调度表、ID 配置错 |
| 校验和错 | classic / enhanced 选错 |
| 偶发数据错 | 接地不一致、电源干扰 |
| 唤醒失败 | 没拉够时间或电压跌 |
| 调度抖动 | 主节点定时器精度不够，要 ≤ 100µs |
| 节点烧坏 | 接到 24V/48V 系统未做隔离 |

## 十二、检查清单

- 确认协议版本与校验类型（classic vs enhanced）；
- 加载/同步 LDF；
- 主节点调度精度 ≤ 100µs；
- 从节点同步窗口 < 0.5%；
- 唤醒/睡眠按 LIN 规范实现；
- 厂商 SDK 提供调度引擎，自己不要手撕；
- 与 CAN 配合时网关负责协议转换。
