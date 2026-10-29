# 模拟语音命令消息（W2·audio_node → /backpack/audio/voice_cmd）
# intent: call(呼唤) / talk(聊天) / walk(去散步) / guide(完成使用指引) / handshake(握手)
string text
string intent
string emotion         # happy / sad / angry / tired / neutral
float32 volume
builtin_interfaces/Time stamp
