---
title: TCP / UDP 详解（含粘包与丢包专题）
date: 2026-06-11
tags: [通信, TCP, UDP, 粘包, 丢包]
summary: TCP/UDP 协议原理、Socket 编程、粘包/拆包（原因 + 4 种解决方案）、UDP 丢包乱序（原因 + 应用层补救）、性能与常见坑。
---

# TCP / UDP

传输层两兄弟。理解二者差异 + 写出正确处理粘包/丢包的代码，是网络编程基本功。

## 一、TCP vs UDP 对比

| 项 | TCP | UDP |
|---|---|---|
| 连接 | 面向连接（三次握手） | 无连接 |
| 可靠 | 可靠：重传、确认、有序 | 不可靠：可能丢、乱序、重复 |
| 边界 | **无消息边界**（字节流） | **有消息边界**（数据报） |
| 头开销 | 20+ B | 8 B |
| 拥塞控制 | 有（滑动窗口/AIMD） | 无 |
| 流控 | 有（接收窗口） | 无 |
| 速度 | 慢（控制开销） | 快 |
| 应用 | HTTP/FTP/SSH/数据库 | DNS/VoIP/视频/游戏/QUIC |

## 二、TCP 三次握手 / 四次挥手

```
握手：
Client → SYN seq=x         → Server
Client ← SYN-ACK seq=y, ack=x+1 ← Server
Client → ACK seq=x+1, ack=y+1 → Server
[ESTABLISHED]

挥手：
A → FIN → B   (A 不再发送)
A ← ACK ← B
A ← FIN ← B   (B 不再发送)
A → ACK → B
A 进入 TIME_WAIT (2*MSL ≈ 60s)
```

`TIME_WAIT` 主动关闭方保留，防止旧报文影响新连接。高并发短连接服务端容易堆积。

## 三、TCP 可靠性机制

- **序列号 + 累计确认**：每字节有 seq，ACK = 已收到的下一字节号；
- **超时重传 RTO**：基于 RTT 估算；
- **快速重传**：连续 3 个重复 ACK → 立即重传；
- **滑动窗口**：发送方控制飞行字节数；
- **拥塞控制**：慢启动、拥塞避免、快速重传/恢复；
- **接收窗口**：接收方告知能再收多少（流控）；
- **Nagle**：合并小包，加 200ms 延迟（实时场景关 `TCP_NODELAY`）。

## 四、Socket 状态

```
CLOSED → LISTEN → SYN_RCVD → ESTABLISHED → CLOSE_WAIT → LAST_ACK → CLOSED
                            ↘ FIN_WAIT_1 → FIN_WAIT_2 → TIME_WAIT → CLOSED
```

`netstat -ano` / `ss -tnp` 查看。

## 五、TCP 编程（.NET）

### 服务端

```csharp
var listener = new TcpListener(IPAddress.Any, 9000);
listener.Start();

while (true) {
    var client = await listener.AcceptTcpClientAsync();
    _ = HandleAsync(client);   // 火忘
}

async Task HandleAsync(TcpClient cli) {
    using (cli)
    using (var ns = cli.GetStream()) {
        ns.ReadTimeout = 10_000;
        ns.WriteTimeout = 10_000;
        var buf = new byte[4096];
        int n;
        while ((n = await ns.ReadAsync(buf)) > 0) {
            await ns.WriteAsync(buf.AsMemory(0, n));   // echo
        }
    }
}
```

### 客户端

```csharp
using var cli = new TcpClient();
await cli.ConnectAsync("127.0.0.1", 9000);
cli.NoDelay = true;                  // 关 Nagle
using var ns = cli.GetStream();
await ns.WriteAsync(Encoding.UTF8.GetBytes("hello\n"));
```

### 高性能：System.IO.Pipelines

避免手动管理缓冲：

```csharp
var pipe = new Pipe();
_ = FillPipeAsync(ns, pipe.Writer);
_ = ReadPipeAsync(pipe.Reader);
```

或者直接用 ASP.NET Core Kestrel / SignalR / gRPC，省去手撕协议。

## 六、粘包 / 拆包专题

### 是什么

TCP 是**字节流**，没有"消息"概念。你发送 `Send("ABC")` + `Send("DEF")`，对端 `Recv` 可能：

- 一次拿到 `"ABCDEF"`（粘包）；
- 拿到 `"AB"` 然后 `"CDEF"`（拆包）；
- 甚至 `"A"`、`"BC"`、`"D"`、`"EF"` 任意分割。

### 为什么

- 发送方 Nagle 算法合并小包；
- 发送方 send 缓冲区合并；
- 接收方 recv 一次返回的数据量取决于已到达字节；
- MSS 限制（以太网 1460B）大包必拆；
- 中间网络分片。

### 解决方案（应用层定帧）

#### 方案 1：固定长度

每帧固定 N 字节。最简单，适合简单设备。

```csharp
async Task<byte[]?> ReadFixedAsync(Stream s, int n, CancellationToken ct) {
    var buf = new byte[n];
    int total = 0;
    while (total < n) {
        int r = await s.ReadAsync(buf.AsMemory(total, n - total), ct);
        if (r == 0) return null;
        total += r;
    }
    return buf;
}
```

#### 方案 2：分隔符

如 `\n`、`\r\n`。文本协议（HTTP、Redis RESP、SMTP）常用。

```csharp
using var sr = new StreamReader(ns);
while ((line = await sr.ReadLineAsync(ct)) != null) Process(line);
```

注意：数据本身不能含分隔符，否则需转义。

#### 方案 3：长度前缀（最通用）

格式：`[长度(2/4B)][数据]`。

```csharp
async Task<byte[]?> ReadFrameAsync(Stream s, CancellationToken ct) {
    var lenBuf = await ReadFixedAsync(s, 4, ct);
    if (lenBuf == null) return null;
    int len = BinaryPrimitives.ReadInt32BigEndian(lenBuf);
    if (len <= 0 || len > 16 * 1024 * 1024) throw new InvalidDataException("bad length");
    return await ReadFixedAsync(s, len, ct);
}

async Task SendFrameAsync(Stream s, byte[] data, CancellationToken ct) {
    var lenBuf = new byte[4];
    BinaryPrimitives.WriteInt32BigEndian(lenBuf, data.Length);
    await s.WriteAsync(lenBuf, ct);
    await s.WriteAsync(data, ct);
}
```

要点：长度上限要限制（防止恶意大长度耗内存）；网络字节序（big-endian）。

#### 方案 4：协议自带帧定界

如 Modbus RTU 用 CRC + 帧间隔；HTTP 用 `Content-Length` 或 `Transfer-Encoding: chunked`；MQTT 用 Variable Byte Integer 长度前缀。

### 工程实现：状态机 + 滚动缓冲

不要每次 read 都从 0 开始解析。维护一个 `MemoryStream` / `Pipe` / `List<byte>`：

```csharp
class FrameParser {
    private readonly byte[] _buf = new byte[64 * 1024];
    private int _start, _end;

    public IEnumerable<byte[]> Feed(byte[] data, int off, int n) {
        Append(data, off, n);
        while (TryReadFrame(out var f)) yield return f;
        Compact();
    }

    bool TryReadFrame(out byte[] f) {
        f = null!;
        if (_end - _start < 4) return false;
        int len = BinaryPrimitives.ReadInt32BigEndian(_buf.AsSpan(_start));
        if (_end - _start < 4 + len) return false;
        f = _buf.AsSpan(_start + 4, len).ToArray();
        _start += 4 + len;
        return true;
    }
    /* Append / Compact 省略 */
}
```

或用 `System.IO.Pipelines` 自动管理。

## 七、UDP 编程

```csharp
// 接收
var udp = new UdpClient(9001);
while (true) {
    var r = await udp.ReceiveAsync();      // 每次完整一个数据报
    Process(r.Buffer, r.RemoteEndPoint);
}

// 发送
var bytes = Encoding.UTF8.GetBytes("hi");
await udp.SendAsync(bytes, "127.0.0.1", 9001);

// 广播
udp.EnableBroadcast = true;
await udp.SendAsync(bytes, new IPEndPoint(IPAddress.Broadcast, 9001));

// 组播
udp.JoinMulticastGroup(IPAddress.Parse("239.0.0.1"));
```

UDP 有边界：`ReceiveAsync` 一次返回完整一个数据报，**不会粘包**。但可能**丢、乱、重**。

## 八、UDP 丢包 / 乱序 / 重复

### 原因

- 网络拥塞 → 路由器丢；
- 接收缓冲区满 → 内核丢；
- 路由 ECMP / 多路径 → 乱序；
- 中间设备重传 → 重复；
- 跨网段 / 防火墙 / NAT。

### 应用层补救

1. **序号 + 确认**：每包带 seq，应答 ACK。重传策略：超时重发、累计确认；
2. **去重**：维护已收 seq 窗口；
3. **排序**：缓存乱序包；
4. **FEC（前向纠错）**：发送冗余包，丢少量也能恢复（音视频常用）；
5. **限速 / 自适应码率**：减少拥塞；
6. **可靠 UDP 库**：`ENet`、`UDT`、`KCP`、`QUIC`。

### KCP 简介

游戏常用的可靠 UDP 库（GitHub 上 skywind3000/kcp）。比 TCP 弱一致性但传输延迟低 30%~40%，丢包恢复快。

C# 移植：`csharp-kcp`、`KcpNet`。

### QUIC

HTTP/3 的传输层（IETF RFC 9000）。基于 UDP 实现：连接迁移、多流、内置 TLS、0-RTT 握手。

.NET 7+ 内置 `QuicListener` / `QuicConnection`：

```csharp
var listener = await QuicListener.ListenAsync(new QuicListenerOptions {
    ListenEndPoint = new IPEndPoint(IPAddress.Any, 9000),
    ApplicationProtocols = new(){ new SslApplicationProtocol("h3") },
    ...
});
```

## 九、MTU / 分片

以太网默认 MTU 1500，IP 头 20 + UDP 头 8 = 28，UDP 净荷 1472。超过会分片，任一片丢则整包重传，对 UDP 是丢包。

最佳实践：UDP 单包 ≤ 1400 B（留余量给 PPPoE 等）。TCP 不用关心，操作系统按 MSS 切分。

## 十、性能要点

### TCP

1. 关 Nagle：`socket.NoDelay = true`（实时小包）；
2. SO_KEEPALIVE 不够灵敏 → 应用层心跳；
3. 大量短连接 → 启用 `TIME_WAIT` 复用（`SO_REUSEADDR` / `tcp_tw_reuse`）；
4. 高并发：用 IOCP / `SocketAsyncEventArgs` / `Pipelines`；
5. 单连接吞吐瓶颈在 RTT × Bandwidth，开 `TCP_WINDOW_SCALING`、增大窗口；
6. ZeroCopy `sendfile`（Kestrel 等已用）；
7. 启用 `TCP_QUICKACK` 减小 ACK 延迟。

### UDP

1. 单线程足够，多线程绑同一端口注意 `SO_REUSEPORT`；
2. 调大 socket 缓冲：`SendBufferSize` / `ReceiveBufferSize`；
3. 包尽量小（≤ 1400B）；
4. 监控丢包率，必要时 FEC / 重传。

## 十一、常见坑

| 坑 | 现象 | 处理 |
|---|---|---|
| TCP 粘包 | 解析错位 | 应用层定帧 |
| 大量 TIME_WAIT | 端口耗尽 | 复用 / 长连接 |
| 半开连接 | 对端崩溃但本地不知 | 心跳检测 |
| `Receive` 返回 0 | 对端正常关闭 | 关连接 |
| 发送方异常 | `ConnectionReset` | catch + 重连 |
| UDP 丢包 | 数据缺失 | 序号 + 重传 / FEC |
| 大 UDP 包 | 偶发整包丢 | 限制 ≤ 1400B |
| 跨 NAT UDP | 单向打不通 | STUN / 打洞 / TURN |
| `WaitAsync` 占线程池 | 大量连接饿死 | 用真异步 IO |
| 重连风暴 | 服务端宕机后大量客户端同时重连 | 指数退避 + jitter |

## 十二、调试工具

- `tcpdump` / `tshark` 抓包；
- `Wireshark` 分析；
- `netstat` / `ss` 看连接状态；
- `ping` / `traceroute` / `mtr`；
- `iperf3` 测带宽 / 抖动 / 丢包；
- `nc` (netcat) 简易收发测试；
- Windows 资源监视器 / Process Hacker。

## 十三、检查清单

- 协议设计：长度前缀 + 限上限 + CRC（必要时）；
- 心跳 + 超时 + 自动重连（指数退避）；
- 缓冲区 / 异常 / 资源释放写完整；
- UDP：序号、去重、限速、必要时上 KCP/QUIC；
- 大端字节序对外；
- 性能压测前确认无内存泄漏（连接、Task）；
- 防御性编程：对端可能任意丢、慢、乱、断。
