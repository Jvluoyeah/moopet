import { jsxs as x, jsx as i, Fragment as te } from "react/jsx-runtime";
import { useState as _, useRef as j, useCallback as ge, useEffect as T, useMemo as Oe } from "react";
import { settings as X, extension as q, INTERNAL_SYSTEM_SLOT as L, Extension as J, useExtensionContext as K, defineSave as jt, method as G } from "@avg-studio/sdk";
const Pe = 2, Le = "剧情选项", Te = {
  width: 1920,
  height: 1080
}, ze = [
  {
    id: "choice-dialog-list",
    refId: "choice-list",
    type: "choice-list",
    name: "选项列表_故事分支",
    rect: {
      x: 500,
      y: 335,
      w: 920,
      h: 410
    },
    anchor: "c",
    style: {
      fontSize: 26,
      fontWeight: 500,
      letterSpacing: 0.4,
      color: "#e8f1f0",
      fill: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      radius: 14,
      opacity: 100,
      customCss: 'font-family: "Plus Jakarta Sans", "M PLUS Rounded 1c", "PingFang SC", "Hiragino Sans GB", "HarmonyOS Sans", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif;'
    },
    animation: {
      enter: {
        preset: "rise",
        durationMs: 420,
        delayMs: 90
      },
      exit: {
        preset: "fade",
        durationMs: 190,
        delayMs: 0
      }
    },
    props: {
      choiceTemplateSchema: "avg.visual-ui.choice/v1",
      direction: "vertical",
      gap: 14,
      bgImage: "",
      previewChoices: [
        "继续追问她",
        "保持沉默",
        "转身离开"
      ],
      previewDisabledIndex: 2
    }
  },
  {
    id: "choice-dialog-item",
    type: "choice-item",
    name: "选项按钮框体_模板",
    rect: {
      x: 504,
      y: 412,
      w: 912,
      h: 76
    },
    anchor: "c",
    style: {
      fill: "rgba(7, 16, 24, 0.86)",
      borderColor: "rgba(127, 212, 200, 0.36)",
      borderWidth: 1,
      radius: 14,
      opacity: 100
    },
    props: {
      choiceListId: "choice-dialog-list",
      hoverSound: "",
      clickSound: "",
      itemImage: "",
      itemHoverImage: "",
      itemPressedImage: "",
      itemDisabledImage: "",
      hoverFill: "rgba(20, 48, 54, 0.94)",
      pressedFill: "rgba(82, 184, 168, 0.24)",
      disabledFill: "rgba(6, 12, 18, 0.58)",
      focusColor: "#7fd4c8"
    }
  },
  {
    id: "choice-dialog-indicator",
    type: "choice-indicator",
    name: "选项强调线_模板",
    rect: {
      x: 505,
      y: 424,
      w: 3,
      h: 52
    },
    anchor: "c",
    style: {
      fill: "#7fd4c8",
      radius: 999,
      opacity: 46,
      customCss: "border-radius: 0 999px 999px 0 !important;"
    },
    props: {
      choiceListId: "choice-dialog-list",
      hoverOpacity: 100,
      pressedOpacity: 100,
      disabledOpacity: 20,
      glow: 14
    }
  },
  {
    id: "choice-dialog-number",
    type: "choice-number",
    name: "选项序号_模板",
    rect: {
      x: 535,
      y: 413,
      w: 34,
      h: 74
    },
    anchor: "c",
    style: {
      fontFamily: '"SFMono-Regular", Consolas, monospace',
      fontSize: 15.08,
      fontWeight: 700,
      letterSpacing: 1.8,
      color: "#7fd4c8",
      opacity: 62,
      textAlign: "left"
    },
    props: {
      choiceListId: "choice-dialog-list",
      numberFormat: "leading-zero",
      numberStart: 1,
      numberPrefix: "",
      numberSuffix: "",
      hoverColor: "#7fd4c8",
      pressedColor: "#7fd4c8",
      disabledColor: "#7fd4c8",
      hoverOpacity: 100,
      pressedOpacity: 100,
      disabledOpacity: 20
    }
  },
  {
    id: "choice-dialog-text",
    type: "choice-text",
    name: "选项正文_模板",
    rect: {
      x: 587,
      y: 413,
      w: 800,
      h: 74
    },
    anchor: "c",
    style: {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: 26,
      fontWeight: 500,
      letterSpacing: 0.4,
      color: "#e8f1f0",
      opacity: 100,
      textAlign: "left"
    },
    props: {
      choiceListId: "choice-dialog-list",
      hoverColor: "#f5fffd",
      pressedColor: "#ffffff",
      disabledColor: "rgba(190, 205, 203, 0.38)",
      lineHeight: 1.45
    }
  }
], Gt = {
  version: Pe,
  name: Le,
  canvas: Te,
  elements: ze
}, Nt = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  canvas: Te,
  default: Gt,
  elements: ze,
  name: Le,
  version: Pe
}, Symbol.toStringTag, { value: "Module" })), Ee = 2, Re = "对话框", Be = {
  width: 1920,
  height: 1080
}, De = [
  {
    id: "dialogue-backdrop",
    refId: "dialogue-backdrop",
    type: "dialogue-backdrop",
    name: "舞台遮罩",
    rect: {
      x: 0,
      y: 0,
      w: 1920,
      h: 1080
    },
    anchor: "c",
    style: {
      fill: "#000000",
      opacity: 0
    },
    props: {}
  },
  {
    id: "dialogue-frame",
    refId: "dialogue-frame",
    type: "dialogue-frame",
    name: "框体背景",
    rect: {
      x: 0,
      y: 880,
      w: 1920,
      h: 200
    },
    anchor: "tl",
    style: {
      fill: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      radius: 0,
      opacity: 100
    },
    props: {
      runtimeOverride: !0,
      backgroundImage: "",
      backgroundImageFit: "stretch",
      backgroundImagePosition: "center",
      backgroundImageRepeat: "no-repeat",
      linearGradient: {
        enabled: !0,
        angle: 0,
        startColor: "rgba(0,0,0,0.75)",
        endColor: "rgba(0,0,0,0.3)"
      },
      frameDecoration: {
        borderTop: "1px solid rgba(255,255,255,0.12)",
        borderRight: "",
        borderBottom: "",
        borderLeft: "",
        borderRadius: "",
        boxShadow: ""
      }
    }
  },
  {
    id: "dialogue-text",
    refId: "dialogue-text",
    type: "dialogue-text",
    name: "对白文本",
    rect: {
      x: 200,
      y: 900,
      w: 1520,
      h: 180
    },
    anchor: "tl",
    style: {
      fontFamily: "'Source Han Sans', 'PingFang SC', sans-serif",
      fontSize: 30,
      fontWeight: 500,
      color: "#f3ede2",
      letterSpacing: 1.2,
      textAlign: "left",
      opacity: 100
    },
    props: {
      lineHeight: 1.75,
      textShadows: [
        {
          offsetX: 0,
          offsetY: 0,
          blur: 1.5,
          color: "rgba(0,0,0,0.95)"
        },
        {
          offsetX: 0,
          offsetY: 0,
          blur: 3,
          color: "rgba(0,0,0,0.7)"
        },
        {
          offsetX: 1,
          offsetY: 2,
          blur: 4,
          color: "rgba(0,0,0,0.6)"
        }
      ],
      previewText: `有些故事，会从一个看似普通的夜晚开始。
而我们，刚好站在它的入口。`
    }
  },
  {
    id: "dialogue-name",
    refId: "dialogue-name",
    type: "dialogue-name",
    name: "角色名",
    rect: {
      x: 200,
      y: 840,
      w: 384,
      h: 40
    },
    anchor: "tl",
    style: {
      fontFamily: "'Source Han Sans', 'PingFang SC', sans-serif",
      fontSize: 34,
      fontWeight: 600,
      color: "#ffd88a",
      fill: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      radius: 0,
      letterSpacing: 1.36,
      textAlign: "left",
      opacity: 100
    },
    props: {
      backgroundImage: "",
      backgroundImageFit: "stretch",
      backgroundImagePosition: "center",
      backgroundImageRepeat: "no-repeat",
      linearGradient: {
        enabled: !1,
        angle: 180,
        startColor: "transparent",
        endColor: "transparent"
      },
      frameDecoration: {
        borderTop: "",
        borderRight: "",
        borderBottom: "",
        borderLeft: "",
        borderRadius: "",
        boxShadow: ""
      },
      lineHeight: 1.5,
      textShadows: [
        {
          offsetX: 0,
          offsetY: 0,
          blur: 1.5,
          color: "rgba(0,0,0,0.95)"
        },
        {
          offsetX: 0,
          offsetY: 0,
          blur: 3,
          color: "rgba(0,0,0,0.7)"
        },
        {
          offsetX: 1,
          offsetY: 2,
          blur: 4,
          color: "rgba(0,0,0,0.6)"
        }
      ],
      previewName: "小满"
    }
  },
  {
    id: "dialogue-wait-cursor",
    refId: "dialogue-wait-cursor",
    type: "dialogue-wait-cursor",
    name: "等待提示",
    rect: {
      x: 1546.4,
      y: 965.6,
      w: 28,
      h: 28
    },
    anchor: "tl",
    style: {
      color: "#ffffff",
      opacity: 100
    },
    props: {
      source: "legacy",
      imageAsset: "",
      shape: "diamond",
      accentColor: "#ff3d00",
      animation: "rotate",
      durationMs: 1e3
    }
  }
], We = {
  text_speed: 30
}, Ut = {
  version: Ee,
  name: Re,
  canvas: Be,
  elements: De,
  dialogueBehavior: We
}, Xt = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  canvas: Be,
  default: Ut,
  dialogueBehavior: We,
  elements: De,
  name: Re,
  version: Ee
}, Symbol.toStringTag, { value: "Module" })), Ae = 2, He = "鉴赏界面", Ve = {
  width: 1920,
  height: 1080
}, Ye = {
  enter: {
    preset: "fade",
    durationMs: 320,
    delayMs: 0
  },
  exit: {
    preset: "fade",
    durationMs: 240,
    delayMs: 0
  }
}, je = [
  {
    id: "mask",
    type: "rect",
    name: "遮罩",
    rect: {
      x: 0,
      y: 0,
      w: 1920,
      h: 1080
    },
    anchor: "c",
    style: {
      fill: "rgba(7, 10, 8, 0.94)",
      radius: 0,
      backdropBlur: 28,
      opacity: 100,
      customCss: "background-image: radial-gradient(ellipse 70% 65% at 72% -5%, rgba(171,111,36,0.19), transparent 60%), radial-gradient(ellipse 55% 50% at 0% 100%, rgba(70,88,58,0.2), transparent 68%), repeating-linear-gradient(0deg, rgba(226,221,191,0.018) 0 1px, transparent 1px 5px), linear-gradient(135deg, rgba(21,28,21,0.98), rgba(5,8,6,0.98));"
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 420,
        delayMs: 0
      },
      exit: {
        preset: "fade",
        durationMs: 220,
        delayMs: 80
      }
    }
  },
  {
    id: "grid-overlay",
    type: "rect",
    name: "装饰_坐标网格",
    rect: {
      x: 0,
      y: 0,
      w: 1920,
      h: 1080
    },
    anchor: "c",
    style: {
      fill: "transparent",
      radius: 0,
      opacity: 100,
      customCss: "background-image: linear-gradient(rgba(227,166,75,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(227,166,75,0.025) 1px, transparent 1px); background-size: 64px 64px; mask-image: linear-gradient(to bottom, black, transparent 78%);"
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 520,
        delayMs: 40
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 40
      }
    }
  },
  {
    id: "eyebrow",
    type: "text",
    name: "文字_档案编号",
    rect: {
      x: 104,
      y: 72,
      w: 680,
      h: 24
    },
    anchor: "tl",
    style: {
      fontSize: 13,
      color: "#e3a64b",
      letterSpacing: 5,
      fontWeight: 700,
      fontFamily: '"JetBrains Mono", "SF Mono", "Menlo", monospace',
      opacity: 100,
      customCss: "text-transform: uppercase; text-shadow: 0 0 14px rgba(227,166,75,0.25);"
    },
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 360,
        delayMs: 70
      },
      exit: {
        preset: "fade",
        durationMs: 140,
        delayMs: 40
      }
    },
    props: {
      text: "ARCHIVE 03 / RECOVERED MATERIALS"
    }
  },
  {
    id: "title",
    type: "text",
    name: "文字_鉴赏档案库",
    rect: {
      x: 100,
      y: 102,
      w: 820,
      h: 72
    },
    anchor: "tl",
    style: {
      fontSize: 50,
      color: "#e7e7da",
      letterSpacing: 2,
      fontWeight: 760,
      fontFamily: '"M PLUS Rounded 1c", "PingFang SC", "Microsoft YaHei", sans-serif',
      opacity: 100,
      customCss: "text-shadow: 0 4px 26px rgba(0,0,0,0.6);"
    },
    animation: {
      enter: {
        preset: "rise",
        durationMs: 440,
        delayMs: 105
      },
      exit: {
        preset: "sink",
        durationMs: 200,
        delayMs: 20
      }
    },
    props: {
      text: "鉴赏档案库"
    }
  },
  {
    id: "status",
    type: "text",
    name: "文字_终端状态",
    rect: {
      x: 1270,
      y: 86,
      w: 470,
      h: 56
    },
    anchor: "tr",
    style: {
      fontSize: 11,
      color: "rgba(215,218,202,0.52)",
      letterSpacing: 3,
      textAlign: "right",
      fontFamily: '"JetBrains Mono", "SF Mono", monospace',
      opacity: 100,
      customCss: "line-height: 1.8;"
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 380,
        delayMs: 170
      },
      exit: {
        preset: "fade",
        durationMs: 140,
        delayMs: 0
      }
    },
    props: {
      text: `TERMINAL ONLINE  ●
CLEARANCE / SURVIVOR`
    }
  },
  {
    id: "close-btn",
    type: "button",
    name: "按钮_关闭当前界面",
    rect: {
      x: 1760,
      y: 84,
      w: 52,
      h: 52
    },
    anchor: "tr",
    style: {
      fontSize: 21,
      color: "#e3a64b",
      fill: "rgba(227,166,75,0.055)",
      borderColor: "rgba(227,166,75,0.32)",
      borderWidth: 1,
      radius: 4,
      opacity: 100,
      customCss: "box-shadow: inset 0 0 0 3px rgba(7,10,8,0.8), 0 8px 24px rgba(0,0,0,0.4); transition: background .16s, border-color .16s, transform .16s; &:hover { background: rgba(227,166,75,0.14); border-color: rgba(227,166,75,0.75); transform: rotate(90deg); }"
    },
    animation: {
      enter: {
        preset: "scale",
        durationMs: 300,
        delayMs: 190
      },
      exit: {
        preset: "shrink",
        durationMs: 160,
        delayMs: 0
      }
    },
    props: {
      text: "×"
    },
    events: {
      onClick: {
        type: "ui.close"
      }
    }
  },
  {
    id: "gallery-tabs",
    type: "tabs",
    name: "页签_CG音乐片段",
    rect: {
      x: 100,
      y: 190,
      w: 1040,
      h: 64
    },
    anchor: "t",
    style: {
      fontSize: 17,
      color: "#f0eadb",
      borderColor: "#e3a64b",
      letterSpacing: 3,
      radius: 0,
      opacity: 100,
      customCss: "& [data-visual-ui-tabs-bar] { border-bottom-color: rgba(227,166,75,0.18) !important; }"
    },
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 420,
        delayMs: 180
      },
      exit: {
        preset: "fade",
        durationMs: 180,
        delayMs: 20
      }
    },
    props: {
      tabs: [
        "影像档案",
        "音频信号",
        "剧情记录"
      ],
      activeIndex: 0,
      gap: 6
    }
  },
  {
    id: "tab-hint",
    type: "text",
    name: "文字_页签提示",
    rect: {
      x: 1260,
      y: 211,
      w: 550,
      h: 28
    },
    anchor: "tr",
    style: {
      fontSize: 10,
      color: "rgba(209,213,197,0.4)",
      letterSpacing: 3,
      textAlign: "right",
      fontFamily: '"JetBrains Mono", monospace',
      opacity: 100
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 320,
        delayMs: 240
      },
      exit: {
        preset: "fade",
        durationMs: 140,
        delayMs: 0
      }
    },
    props: {
      text: "SELECT ARCHIVE TYPE / 点击页签切换鉴赏模式"
    }
  },
  {
    id: "cg-gallery",
    type: "cg-gallery",
    name: "智能组件_CG鉴赏",
    rect: {
      x: 100,
      y: 286,
      w: 1712,
      h: 680
    },
    anchor: "c",
    style: {
      radius: 6,
      opacity: 100
    },
    animation: {
      enter: {
        preset: "rise",
        durationMs: 520,
        delayMs: 240
      },
      exit: {
        preset: "sink",
        durationMs: 240,
        delayMs: 0
      }
    },
    props: {
      sharedSource: "ext:avg.internal.default-shell.unlockedShared",
      slotSource: "ext:avg.internal.default-shell.unlockedSlot",
      cols: 4,
      rows: 2,
      gap: 20,
      emptyText: "尚未回收任何影像档案",
      accentColor: "#e3a64b"
    },
    tab: {
      of: "gallery-tabs",
      index: 0
    }
  },
  {
    id: "music-gallery",
    type: "music-gallery",
    name: "智能组件_音乐鉴赏",
    rect: {
      x: 100,
      y: 286,
      w: 1712,
      h: 680
    },
    anchor: "c",
    style: {
      radius: 6,
      opacity: 100
    },
    animation: {
      enter: {
        preset: "rise",
        durationMs: 520,
        delayMs: 240
      },
      exit: {
        preset: "sink",
        durationMs: 240,
        delayMs: 0
      }
    },
    props: {
      sharedSource: "ext:avg.internal.default-shell.unlockedMusicShared",
      slotSource: "ext:avg.internal.default-shell.unlockedMusicSlot",
      emptyText: "尚未截获任何音频信号",
      accentColor: "#e3a64b",
      showArtist: !0,
      showDescription: !0
    },
    tab: {
      of: "gallery-tabs",
      index: 1
    }
  },
  {
    id: "fragment-gallery",
    type: "fragment-gallery",
    name: "智能组件_片段鉴赏",
    rect: {
      x: 100,
      y: 286,
      w: 1712,
      h: 680
    },
    anchor: "c",
    style: {
      radius: 6,
      opacity: 100
    },
    animation: {
      enter: {
        preset: "rise",
        durationMs: 520,
        delayMs: 240
      },
      exit: {
        preset: "sink",
        durationMs: 240,
        delayMs: 0
      }
    },
    props: {
      sharedSource: "ext:avg.internal.default-shell.unlockedFragmentsShared",
      slotSource: "ext:avg.internal.default-shell.unlockedFragmentsSlot",
      cols: 3,
      rows: 2,
      gap: 20,
      emptyText: "尚未解密任何剧情记录",
      accentColor: "#e3a64b",
      showDescription: !0
    },
    tab: {
      of: "gallery-tabs",
      index: 2
    }
  },
  {
    id: "footer-left",
    type: "text",
    name: "文字_底部操作提示",
    rect: {
      x: 102,
      y: 1006,
      w: 680,
      h: 22
    },
    anchor: "bl",
    style: {
      fontSize: 10,
      color: "rgba(211,215,200,0.38)",
      letterSpacing: 2,
      fontFamily: '"JetBrains Mono", monospace',
      opacity: 100
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 320,
        delayMs: 360
      },
      exit: {
        preset: "fade",
        durationMs: 120,
        delayMs: 0
      }
    },
    props: {
      text: "ESC / MIDDLE CLICK  返回上一级"
    }
  },
  {
    id: "footer-right",
    type: "text",
    name: "文字_档案权限",
    rect: {
      x: 1230,
      y: 1006,
      w: 580,
      h: 22
    },
    anchor: "br",
    style: {
      fontSize: 10,
      color: "rgba(227,166,75,0.46)",
      letterSpacing: 3,
      textAlign: "right",
      fontFamily: '"JetBrains Mono", monospace',
      opacity: 100
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 320,
        delayMs: 390
      },
      exit: {
        preset: "fade",
        durationMs: 120,
        delayMs: 0
      }
    },
    props: {
      text: "PROPERTY OF SHELTER NETWORK / LEVEL 03"
    }
  }
], qt = {
  version: Ae,
  name: He,
  canvas: Ve,
  transition: Ye,
  elements: je
}, Jt = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  canvas: Ve,
  default: qt,
  elements: je,
  name: He,
  transition: Ye,
  version: Ae
}, Symbol.toStringTag, { value: "Module" })), Ge = 1, Ne = "历史记录", Ue = {
  width: 1920,
  height: 1080
}, Xe = {
  exit: {
    preset: "fade",
    durationMs: 280,
    delayMs: 0
  }
}, qe = [
  {
    id: "mask",
    type: "rect",
    name: "遮罩",
    rect: {
      x: 0,
      y: 0,
      w: 1920,
      h: 1080
    },
    anchor: "c",
    style: {
      fill: "rgba(8, 13, 20, 0.88)",
      radius: 0,
      backdropBlur: 28,
      opacity: 100,
      customCss: "background-image: radial-gradient(ellipse 110% 85% at 18% 0%, rgba(40,70,100,0.36), transparent 58%), linear-gradient(115deg, rgba(127,212,200,0.025), transparent 45%);"
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 420,
        delayMs: 0
      },
      exit: {
        preset: "fade",
        durationMs: 260,
        delayMs: 80
      }
    }
  },
  {
    id: "eyebrow",
    type: "text",
    name: "文字_Narrative_Log",
    rect: {
      x: 120,
      y: 96,
      w: 560,
      h: 24
    },
    anchor: "tl",
    style: {
      fontSize: 15,
      color: "#7fd4c8",
      letterSpacing: 5,
      fontFamily: '"JetBrains Mono", "SF Mono", "Menlo", monospace',
      opacity: 100,
      customCss: "text-transform: uppercase; text-shadow: 0 0 12px rgba(127,212,200,0.4);"
    },
    props: {
      text: "Narrative Log"
    },
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 360,
        delayMs: 80
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 60
      }
    }
  },
  {
    id: "title",
    type: "text",
    name: "文字_历史记录",
    rect: {
      x: 118,
      y: 122,
      w: 800,
      h: 80
    },
    anchor: "tl",
    style: {
      fontSize: 56,
      color: "#e8edf2",
      letterSpacing: 2,
      fontFamily: '"M PLUS Rounded 1c", "Plus Jakarta Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
      opacity: 100
    },
    props: {
      text: "历史记录"
    },
    animation: {
      enter: {
        preset: "rise",
        durationMs: 460,
        delayMs: 120
      },
      exit: {
        preset: "sink",
        durationMs: 220,
        delayMs: 40
      }
    }
  },
  {
    id: "title-accent",
    type: "rect",
    name: "玉青短横线",
    rect: {
      x: 120,
      y: 212,
      w: 72,
      h: 4
    },
    anchor: "tl",
    style: {
      fill: "#7fd4c8",
      radius: 999,
      opacity: 100,
      customCss: "background-image: linear-gradient(90deg, #7fd4c8, #5eb8d4); box-shadow: 0 0 14px rgba(94,184,212,0.5);"
    },
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 420,
        delayMs: 190
      },
      exit: {
        preset: "shrink",
        durationMs: 180,
        delayMs: 20
      }
    }
  },
  {
    id: "hint",
    type: "text",
    name: "文字_回看说明",
    rect: {
      x: 1320,
      y: 172,
      w: 360,
      h: 28
    },
    anchor: "tr",
    style: {
      fontSize: 14,
      color: "rgba(232,237,242,0.46)",
      letterSpacing: 2,
      textAlign: "right",
      fontFamily: '"JetBrains Mono", "SF Mono", monospace',
      opacity: 100
    },
    props: {
      text: "SCROLL TO REVIEW  ·  ▶ REPLAY"
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 360,
        delayMs: 220
      },
      exit: {
        preset: "fade",
        durationMs: 140,
        delayMs: 0
      }
    }
  },
  {
    id: "close-btn",
    type: "button",
    name: "按钮_关闭当前界面",
    rect: {
      x: 1748,
      y: 118,
      w: 52,
      h: 52
    },
    anchor: "tr",
    style: {
      fontSize: 22,
      color: "#dce8f2",
      fill: "rgba(120, 150, 180, 0.06)",
      borderColor: "rgba(150, 180, 210, 0.14)",
      borderWidth: 1,
      radius: 12,
      backdropBlur: 10,
      opacity: 100,
      customCss: "box-shadow: inset 0 1px 0 rgba(200,225,245,0.06), 0 4px 14px rgba(4,10,18,0.4); transition: transform 180ms cubic-bezier(0.22,1,0.36,1), background 180ms, border-color 180ms, box-shadow 180ms; &:hover { background: rgba(127,212,200,0.12); border-color: rgba(127,212,200,0.55); box-shadow: 0 0 22px rgba(94,184,212,0.3); transform: rotate(90deg); }"
    },
    props: {
      text: "✕"
    },
    events: {
      onClick: {
        type: "ui.close"
      }
    },
    animation: {
      enter: {
        preset: "scale",
        durationMs: 320,
        delayMs: 200
      },
      exit: {
        preset: "shrink",
        durationMs: 180,
        delayMs: 0
      }
    }
  },
  {
    id: "history-list",
    type: "history-list",
    name: "历史记录_对话",
    rect: {
      x: 300,
      y: 264,
      w: 1320,
      h: 718
    },
    anchor: "c",
    style: {
      fontSize: 22,
      color: "#e8edf2",
      fill: "rgba(9, 16, 24, 0.58)",
      borderColor: "rgba(127, 212, 200, 0.22)",
      borderWidth: 1,
      radius: 18,
      letterSpacing: 0.6,
      opacity: 100,
      customCss: "filter: drop-shadow(0 26px 68px rgba(0,0,0,0.26));"
    },
    props: {
      maxEntries: 200,
      gap: 12,
      showSpeaker: !0,
      showVoiceButton: !0,
      showTimeline: !0,
      emptyText: "还没有可以回看的对话",
      accentColor: "#7fd4c8"
    },
    animation: {
      enter: {
        preset: "rise",
        durationMs: 540,
        delayMs: 230
      },
      exit: {
        preset: "sink",
        durationMs: 260,
        delayMs: 0
      }
    }
  }
], Kt = {
  version: Ge,
  name: Ne,
  canvas: Ue,
  transition: Xe,
  elements: qe
}, Qt = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  canvas: Ue,
  default: Kt,
  elements: qe,
  name: Ne,
  transition: Xe,
  version: Ge
}, Symbol.toStringTag, { value: "Module" })), Je = 1, Ke = "变量输入对话框", Qe = {
  width: 1920,
  height: 1080
}, Ze = [
  {
    id: "input-dialog-mask",
    type: "rect",
    name: "遮罩",
    rect: {
      x: 0,
      y: 0,
      w: 1920,
      h: 1080
    },
    anchor: "c",
    style: {
      fill: "rgba(3, 8, 13, 0.66)",
      radius: 0,
      backdropBlur: 16,
      opacity: 100,
      customCss: "background-image: radial-gradient(ellipse 70% 70% at 50% 42%, rgba(46,90,96,0.18), transparent 68%);"
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 300,
        delayMs: 0
      },
      exit: {
        preset: "fade",
        durationMs: 220,
        delayMs: 60
      }
    }
  },
  {
    id: "input-dialog-standard",
    refId: "input-dialog",
    type: "input-dialog",
    name: "输入对话框_玩家姓名",
    rect: {
      x: 530,
      y: 300,
      w: 860,
      h: 480
    },
    anchor: "c",
    style: {
      fontSize: 24,
      color: "#f4f8f7",
      fill: "rgba(9, 18, 27, 0.96)",
      borderColor: "#7fd4c8",
      borderWidth: 1,
      radius: 18,
      opacity: 100
    },
    animation: {
      enter: {
        preset: "scale",
        durationMs: 380,
        delayMs: 70
      },
      exit: {
        preset: "shrink",
        durationMs: 220,
        delayMs: 0
      }
    },
    props: {
      variable: "playerName",
      valueType: "string",
      title: "请告诉我你的名字",
      description: "这个名字会在接下来的故事中使用。",
      placeholder: "输入名字",
      defaultValue: "",
      confirmText: "确认",
      requiredText: "请输入名字后再继续",
      required: !0,
      minLength: 0,
      maxLength: 20,
      step: 1,
      dismissible: !1
    }
  }
], Zt = {
  version: Je,
  name: Ke,
  canvas: Qe,
  elements: Ze
}, er = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  canvas: Qe,
  default: Zt,
  elements: Ze,
  name: Ke,
  version: Je
}, Symbol.toStringTag, { value: "Module" })), et = 1, tt = "标准消息框", rt = {
  width: 1920,
  height: 1080
}, at = [
  {
    id: "message-box-mask",
    type: "rect",
    name: "遮罩",
    rect: {
      x: 0,
      y: 0,
      w: 1920,
      h: 1080
    },
    anchor: "c",
    style: {
      fill: "rgba(3, 8, 13, 0.66)",
      radius: 0,
      backdropBlur: 16,
      opacity: 100,
      customCss: "background-image: radial-gradient(ellipse 70% 70% at 50% 42%, rgba(46,90,96,0.18), transparent 68%);"
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 300,
        delayMs: 0
      },
      exit: {
        preset: "fade",
        durationMs: 220,
        delayMs: 60
      }
    }
  },
  {
    id: "message-box-standard",
    refId: "message-box",
    type: "message-box",
    name: "消息框_提示",
    rect: {
      x: 560,
      y: 340,
      w: 800,
      h: 400
    },
    anchor: "c",
    style: {
      fontSize: 24,
      color: "#f4f8f7",
      fill: "rgba(9, 18, 27, 0.96)",
      borderColor: "#7fd4c8",
      borderWidth: 1,
      radius: 18,
      opacity: 100
    },
    animation: {
      enter: {
        preset: "rise",
        durationMs: 380,
        delayMs: 70
      },
      exit: {
        preset: "sink",
        durationMs: 220,
        delayMs: 0
      }
    },
    props: {
      mode: "alert",
      title: "提示",
      message: "这里显示需要告诉玩家的消息。",
      confirmText: "知道了",
      cancelText: "取消",
      tone: "info",
      dismissible: !0
    }
  }
], tr = {
  version: et,
  name: tt,
  canvas: rt,
  elements: at
}, rr = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  canvas: rt,
  default: tr,
  elements: at,
  name: tt,
  version: et
}, Symbol.toStringTag, { value: "Module" })), ot = 2, nt = "段落 · 电影留白", st = {
  width: 1920,
  height: 1080
}, it = [
  {
    id: "background-mask",
    refId: "background-mask",
    type: "background-mask",
    name: "背景遮罩",
    rect: {
      x: 0,
      y: 0,
      w: 1920,
      h: 1080
    },
    anchor: "c",
    style: {
      fill: "#05070d",
      opacity: 66
    }
  },
  {
    id: "paragraph",
    refId: "paragraph",
    type: "paragraph",
    name: "整屏段落",
    rect: {
      x: 400,
      y: 94,
      w: 1120,
      h: 892
    },
    anchor: "t",
    style: {
      fontFamily: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
      fontSize: 31,
      fontWeight: 500,
      color: "#f7f3ec",
      fill: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      radius: 0,
      backdropBlur: 0,
      letterSpacing: 1.6,
      textAlign: "left",
      opacity: 100
    },
    props: {
      gap: 32,
      lineHeight: 1.82,
      inactiveColor: "#cbc8c2",
      readBehavior: {
        mode: "dim",
        followMode: "overflow"
      },
      readStyle: {
        color: "#cbc8c2",
        opacity: 62,
        transform: {
          y: -4,
          scale: 100
        },
        transition: {
          preset: "fade-up",
          durationMs: 240,
          delayMs: 0,
          easing: "soft"
        }
      },
      textPadding: {
        top: 48,
        right: 56,
        bottom: 48,
        left: 56
      },
      backgroundImage: "",
      backgroundImageFit: "cover",
      backgroundImagePosition: "center",
      backgroundImageRepeat: "no-repeat",
      linearGradient: {
        enabled: !1,
        angle: 180,
        startColor: "transparent",
        endColor: "transparent"
      },
      frameDecoration: {
        borderTop: "",
        borderRight: "",
        borderBottom: "",
        borderLeft: "",
        borderRadius: "",
        boxShadow: ""
      },
      textShadows: [
        {
          offsetX: 0,
          offsetY: 0,
          blur: 3,
          color: "rgba(0, 0, 0, 0.95)"
        },
        {
          offsetX: 0,
          offsetY: 2,
          blur: 14,
          color: "rgba(0, 0, 0, 0.85)"
        }
      ],
      previewParagraphs: [
        "银幕暗下去以后，远处的海潮才重新有了声音。",
        "我沿着那道微光向前，仿佛正走进故事尚未写完的部分。",
        "直到她在身后叫住我，所有沉默才有了方向。"
      ]
    }
  }
], ar = {
  version: ot,
  name: nt,
  canvas: st,
  elements: it
}, or = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  canvas: st,
  default: ar,
  elements: it,
  name: nt,
  version: ot
}, Symbol.toStringTag, { value: "Module" })), lt = 2, dt = "段落 · 暮色手账", ct = {
  width: 1920,
  height: 1080
}, pt = [
  {
    id: "background-mask",
    refId: "background-mask",
    type: "background-mask",
    name: "背景遮罩",
    rect: {
      x: 0,
      y: 0,
      w: 1920,
      h: 1080
    },
    anchor: "c",
    style: {
      fill: "#241618",
      opacity: 42
    }
  },
  {
    id: "paragraph",
    refId: "paragraph",
    type: "paragraph",
    name: "整屏段落",
    rect: {
      x: 336,
      y: 72,
      w: 1248,
      h: 936
    },
    anchor: "t",
    style: {
      fontFamily: "'Kaiti SC', STKaiti, KaiTi, 'Songti SC', serif",
      fontSize: 30,
      fontWeight: 400,
      color: "#fff8ef",
      fill: "rgba(68, 43, 39, 0.88)",
      borderColor: "rgba(255, 225, 205, 0.22)",
      borderWidth: 1,
      radius: 32,
      backdropBlur: 12,
      letterSpacing: 1.2,
      textAlign: "left",
      opacity: 100
    },
    props: {
      gap: 30,
      lineHeight: 1.82,
      inactiveColor: "#dcc6b9",
      readBehavior: {
        mode: "dim",
        followMode: "overflow"
      },
      readStyle: {
        color: "#dcc6b9",
        opacity: 74,
        filter: {
          blur: 0.3,
          grayscale: 4,
          brightness: 96
        },
        transform: {
          y: -2,
          scale: 99
        },
        transition: {
          preset: "settle",
          durationMs: 260,
          delayMs: 0,
          easing: "soft"
        }
      },
      textPadding: {
        top: 64,
        right: 72,
        bottom: 64,
        left: 72
      },
      backgroundImage: "",
      backgroundImageFit: "cover",
      backgroundImagePosition: "center",
      backgroundImageRepeat: "no-repeat",
      linearGradient: {
        enabled: !0,
        angle: 150,
        startColor: "rgba(92, 57, 50, 0.92)",
        endColor: "rgba(49, 33, 39, 0.90)"
      },
      frameDecoration: {
        borderTop: "",
        borderRight: "",
        borderBottom: "",
        borderLeft: "",
        borderRadius: "",
        boxShadow: "0 24px 64px rgba(42, 20, 18, 0.32), inset 0 1px 0 rgba(255, 249, 241, 0.12)"
      },
      textShadows: [
        {
          offsetX: 0,
          offsetY: 2,
          blur: 7,
          color: "rgba(45, 24, 20, 0.55)"
        }
      ],
      previewParagraphs: [
        "傍晚的风把窗帘吹得鼓起来，也把厨房里的甜香送到了书桌边。",
        "她在便签背面画了一朵歪歪扭扭的花，然后认真地写下明天见。",
        "门铃响起时，那张便签还被晚风轻轻压在杯沿下。"
      ]
    }
  }
], nr = {
  version: lt,
  name: dt,
  canvas: ct,
  elements: pt
}, sr = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  canvas: ct,
  default: nr,
  elements: pt,
  name: dt,
  version: lt
}, Symbol.toStringTag, { value: "Module" })), ut = 2, ft = "段落 · 书页叙事", gt = {
  width: 1920,
  height: 1080
}, yt = [
  {
    id: "background-mask",
    refId: "background-mask",
    type: "background-mask",
    name: "背景遮罩",
    rect: {
      x: 0,
      y: 0,
      w: 1920,
      h: 1080
    },
    anchor: "c",
    style: {
      fill: "#1a1410",
      opacity: 36
    }
  },
  {
    id: "paragraph",
    refId: "paragraph",
    type: "paragraph",
    name: "整屏段落",
    rect: {
      x: 320,
      y: 64,
      w: 1280,
      h: 952
    },
    anchor: "t",
    style: {
      fontFamily: "'Songti SC', STSong, SimSun, serif",
      fontSize: 29,
      fontWeight: 400,
      color: "#342b24",
      fill: "rgba(250, 244, 230, 0.96)",
      borderColor: "#d0b98f",
      borderWidth: 1,
      radius: 8,
      backdropBlur: 0,
      letterSpacing: 1.4,
      textAlign: "left",
      opacity: 100
    },
    props: {
      gap: 30,
      lineHeight: 1.9,
      inactiveColor: "#746659",
      readBehavior: {
        mode: "dim",
        followMode: "overflow"
      },
      readStyle: {
        color: "#746659",
        opacity: 82,
        filter: {
          grayscale: 8,
          brightness: 94
        },
        transform: {
          y: 1,
          scale: 99.5
        },
        transition: {
          preset: "settle",
          durationMs: 260,
          delayMs: 0,
          easing: "soft"
        }
      },
      textPadding: {
        top: 68,
        right: 88,
        bottom: 68,
        left: 88
      },
      backgroundImage: "",
      backgroundImageFit: "cover",
      backgroundImagePosition: "center",
      backgroundImageRepeat: "no-repeat",
      linearGradient: {
        enabled: !0,
        angle: 165,
        startColor: "rgba(255, 251, 240, 0.98)",
        endColor: "rgba(237, 224, 200, 0.96)"
      },
      frameDecoration: {
        borderTop: "",
        borderRight: "",
        borderBottom: "",
        borderLeft: "",
        borderRadius: "",
        boxShadow: "0 20px 60px rgba(20, 12, 6, 0.34), inset 0 0 42px rgba(130, 92, 48, 0.10)"
      },
      textShadows: [],
      previewParagraphs: [
        "信纸在窗边压了一夜，边角沾着一点潮湿的月色。",
        "那些没有寄出的句子，如今读来，竟比当时更接近答案。",
        "我翻到最后一页，才发现答案一直藏在落款旁。"
      ]
    }
  }
], ir = {
  version: ut,
  name: ft,
  canvas: gt,
  elements: yt
}, lr = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  canvas: gt,
  default: ir,
  elements: yt,
  name: ft,
  version: ut
}, Symbol.toStringTag, { value: "Module" })), mt = 2, bt = "段落 · 冷光档案", ht = {
  width: 1920,
  height: 1080
}, xt = [
  {
    id: "background-mask",
    refId: "background-mask",
    type: "background-mask",
    name: "背景遮罩",
    rect: {
      x: 0,
      y: 0,
      w: 1920,
      h: 1080
    },
    anchor: "c",
    style: {
      fill: "#041224",
      opacity: 58
    }
  },
  {
    id: "paragraph",
    refId: "paragraph",
    type: "paragraph",
    name: "整屏段落",
    rect: {
      x: 320,
      y: 72,
      w: 1280,
      h: 936
    },
    anchor: "t",
    style: {
      fontFamily: "'PingFang SC', 'Microsoft YaHei', Arial, sans-serif",
      fontSize: 29,
      fontWeight: 500,
      color: "#eaf7ff",
      fill: "rgba(4, 12, 24, 0.90)",
      borderColor: "rgba(91, 207, 255, 0.18)",
      borderWidth: 1,
      radius: 4,
      backdropBlur: 8,
      letterSpacing: 0.6,
      textAlign: "left",
      opacity: 100
    },
    props: {
      gap: 24,
      lineHeight: 1.68,
      inactiveColor: "#9fb9c8",
      readBehavior: {
        mode: "dim",
        followMode: "overflow"
      },
      readStyle: {
        color: "#9fb9c8",
        opacity: 58,
        filter: {
          grayscale: 18,
          brightness: 84
        },
        transform: {
          x: -4,
          scale: 100
        },
        transition: {
          preset: "settle",
          durationMs: 200,
          delayMs: 0,
          easing: "ease-out"
        }
      },
      textPadding: {
        top: 52,
        right: 68,
        bottom: 52,
        left: 68
      },
      backgroundImage: "",
      backgroundImageFit: "cover",
      backgroundImagePosition: "center",
      backgroundImageRepeat: "no-repeat",
      linearGradient: {
        enabled: !0,
        angle: 180,
        startColor: "rgba(7, 26, 45, 0.95)",
        endColor: "rgba(2, 8, 18, 0.94)"
      },
      frameDecoration: {
        borderTop: "1px solid rgba(91, 207, 255, 0.18)",
        borderRight: "1px solid rgba(91, 207, 255, 0.18)",
        borderBottom: "1px solid rgba(91, 207, 255, 0.18)",
        borderLeft: "3px solid rgba(91, 207, 255, 0.85)",
        borderRadius: "4px",
        boxShadow: "0 0 30px rgba(67, 181, 255, 0.16), inset 0 0 40px rgba(0, 97, 156, 0.08)"
      },
      textShadows: [
        {
          offsetX: 0,
          offsetY: 1,
          blur: 2,
          color: "rgba(0, 0, 0, 0.85)"
        },
        {
          offsetX: 0,
          offsetY: 0,
          blur: 8,
          color: "rgba(81, 194, 255, 0.22)"
        }
      ],
      previewParagraphs: [
        "记录编号 07：城区照明在凌晨三点十七分同时熄灭。",
        "唯一仍在运转的终端，反复显示着同一句尚未解密的留言。",
        "我按下确认键，冷光里终于浮出了一个名字。"
      ]
    }
  }
], dr = {
  version: mt,
  name: bt,
  canvas: ht,
  elements: xt
}, cr = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  canvas: ht,
  default: dr,
  elements: xt,
  name: bt,
  version: mt
}, Symbol.toStringTag, { value: "Module" })), vt = 2, St = "段落", wt = {
  width: 1920,
  height: 1080
}, Mt = [
  {
    id: "background-mask",
    refId: "background-mask",
    type: "background-mask",
    name: "背景遮罩",
    rect: {
      x: 0,
      y: 0,
      w: 1920,
      h: 1080
    },
    anchor: "c",
    style: {
      fill: "#000000",
      opacity: 70
    }
  },
  {
    id: "paragraph",
    refId: "paragraph",
    type: "paragraph",
    name: "整屏段落",
    rect: {
      x: 384,
      y: 80,
      w: 1152,
      h: 1e3
    },
    anchor: "t",
    style: {
      fontSize: 28,
      fontWeight: 400,
      color: "#ffffff",
      fill: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      radius: 0,
      backdropBlur: 0,
      letterSpacing: 0,
      textAlign: "left",
      opacity: 100
    },
    props: {
      layoutMode: "native-fluid",
      gap: 30,
      inactiveColor: "#808080",
      textPadding: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      },
      backgroundImage: "",
      backgroundImageFit: "cover",
      backgroundImagePosition: "center",
      backgroundImageRepeat: "no-repeat",
      linearGradient: {
        enabled: !1,
        angle: 180,
        startColor: "transparent",
        endColor: "transparent"
      },
      frameDecoration: {
        borderTop: "",
        borderRight: "",
        borderBottom: "",
        borderLeft: "",
        borderRadius: "",
        boxShadow: ""
      },
      textShadows: [],
      previewParagraphs: [
        "有些故事，会从一个看似普通的夜晚开始。",
        "而我们，刚好站在它的入口。",
        "那一刻，远处的钟声正好响起。"
      ]
    }
  }
], pr = {
  version: vt,
  name: St,
  canvas: wt,
  elements: Mt
}, ur = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  canvas: wt,
  default: pr,
  elements: Mt,
  name: St,
  version: vt
}, Symbol.toStringTag, { value: "Module" })), kt = 1, $t = "存档读档", _t = {
  width: 1920,
  height: 1080
}, Ct = [
  {
    id: "mask",
    type: "rect",
    name: "遮罩",
    rect: {
      x: 0,
      y: 0,
      w: 1920,
      h: 1080
    },
    anchor: "c",
    style: {
      fill: "rgba(8, 13, 20, 0.86)",
      radius: 0,
      backdropBlur: 28,
      opacity: 100,
      customCss: "background-image: radial-gradient(ellipse 120% 80% at 20% 0%, rgba(40,70,100,0.35), transparent 60%);"
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 420,
        delayMs: 0
      },
      exit: {
        preset: "fade",
        durationMs: 260,
        delayMs: 100
      }
    }
  },
  {
    id: "eyebrow",
    type: "text",
    name: "文字_Save",
    rect: {
      x: 120,
      y: 96,
      w: 500,
      h: 24
    },
    anchor: "tl",
    style: {
      fontSize: 15,
      color: "#7fd4c8",
      letterSpacing: 5,
      fontFamily: '"JetBrains Mono", "SF Mono", "Menlo", "Monaco", "Consolas", monospace',
      opacity: 100,
      customCss: "text-transform: uppercase; text-shadow: 0 0 12px rgba(127,212,200,0.4);"
    },
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 360,
        delayMs: 80
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 60
      }
    },
    props: {
      text: "Save / Load"
    }
  },
  {
    id: "title",
    type: "text",
    name: "文字_保存存档",
    rect: {
      x: 118,
      y: 122,
      w: 800,
      h: 80
    },
    anchor: "tl",
    style: {
      fontSize: 56,
      color: "#e8edf2",
      letterSpacing: 2,
      fontFamily: '"M PLUS Rounded 1c", "Plus Jakarta Sans", "PingFang SC", "Hiragino Sans GB", "HarmonyOS Sans", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif',
      opacity: 100
    },
    animation: {
      enter: {
        preset: "rise",
        durationMs: 460,
        delayMs: 120
      },
      exit: {
        preset: "sink",
        durationMs: 220,
        delayMs: 40
      }
    },
    props: {
      text: "存档 / 读档"
    }
  },
  {
    id: "title-accent",
    type: "rect",
    name: "玉青短横线",
    rect: {
      x: 120,
      y: 212,
      w: 72,
      h: 4
    },
    anchor: "tl",
    style: {
      fill: "#7fd4c8",
      radius: 999,
      opacity: 100,
      customCss: "background-image: linear-gradient(90deg, #7fd4c8, #5eb8d4); box-shadow: 0 0 14px rgba(94,184,212,0.5);"
    },
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 420,
        delayMs: 190
      },
      exit: {
        preset: "shrink",
        durationMs: 180,
        delayMs: 20
      }
    }
  },
  {
    id: "close-btn",
    type: "button",
    name: "按钮_关闭当前界面",
    rect: {
      x: 1748,
      y: 118,
      w: 52,
      h: 52
    },
    anchor: "tr",
    style: {
      fontSize: 22,
      color: "#dce8f2",
      fill: "rgba(120, 150, 180, 0.06)",
      borderColor: "rgba(150, 180, 210, 0.14)",
      borderWidth: 1,
      radius: 12,
      backdropBlur: 10,
      opacity: 100,
      customCss: "box-shadow: inset 0 1px 0 rgba(200,225,245,0.06), 0 4px 14px rgba(4,10,18,0.4); transition: transform 180ms cubic-bezier(0.22,1,0.36,1), background 180ms, border-color 180ms, box-shadow 180ms; &:hover { background: rgba(127,212,200,0.12); border-color: rgba(127,212,200,0.55); box-shadow: 0 0 22px rgba(94,184,212,0.3); transform: rotate(90deg); }"
    },
    animation: {
      enter: {
        preset: "scale",
        durationMs: 320,
        delayMs: 200
      },
      exit: {
        preset: "shrink",
        durationMs: 180,
        delayMs: 0
      }
    },
    props: {
      text: "✕"
    },
    events: {
      onClick: {
        type: "ui.close"
      }
    }
  },
  {
    id: "save-grid",
    type: "save-grid",
    name: "存档格子",
    rect: {
      x: 120,
      y: 264,
      w: 1680,
      h: 720
    },
    anchor: "c",
    style: {
      radius: 16,
      opacity: 100
    },
    animation: {
      enter: {
        preset: "rise",
        durationMs: 520,
        delayMs: 240
      },
      exit: {
        preset: "sink",
        durationMs: 260,
        delayMs: 0
      }
    },
    props: {
      cols: 3,
      rows: 2,
      gap: 28,
      showTime: !0,
      showText: !0,
      mode: "auto",
      confirmOverwrite: !0,
      totalSlots: 30
    }
  }
], fr = {
  version: kt,
  name: $t,
  canvas: _t,
  elements: Ct
}, gr = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  canvas: _t,
  default: fr,
  elements: Ct,
  name: $t,
  version: kt
}, Symbol.toStringTag, { value: "Module" })), Ft = 2, It = "系统设置", Ot = {
  width: 1920,
  height: 1080
}, Pt = [
  {
    id: "mask",
    type: "rect",
    name: "遮罩",
    rect: {
      x: 0,
      y: 0,
      w: 1920,
      h: 1080
    },
    anchor: "c",
    style: {
      fill: "rgba(8, 13, 20, 0.86)",
      radius: 0,
      backdropBlur: 28,
      opacity: 100,
      customCss: "background-image: radial-gradient(ellipse 120% 80% at 20% 0%, rgba(40,70,100,0.35), transparent 60%);"
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 420,
        delayMs: 0
      },
      exit: {
        preset: "fade",
        durationMs: 260,
        delayMs: 100
      }
    }
  },
  {
    id: "eyebrow",
    type: "text",
    name: "文字_Settings",
    rect: {
      x: 120,
      y: 96,
      w: 500,
      h: 24
    },
    anchor: "tl",
    style: {
      fontSize: 15,
      color: "#7fd4c8",
      letterSpacing: 5,
      fontFamily: '"JetBrains Mono", "SF Mono", "Menlo", "Monaco", "Consolas", monospace',
      opacity: 100,
      customCss: "text-transform: uppercase; text-shadow: 0 0 12px rgba(127,212,200,0.4);"
    },
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 360,
        delayMs: 80
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 60
      }
    },
    props: {
      text: "Settings"
    }
  },
  {
    id: "title",
    type: "text",
    name: "文字_系统设置",
    rect: {
      x: 118,
      y: 122,
      w: 800,
      h: 80
    },
    anchor: "tl",
    style: {
      fontSize: 56,
      color: "#e8edf2",
      letterSpacing: 2,
      fontFamily: '"M PLUS Rounded 1c", "Plus Jakarta Sans", "PingFang SC", "Hiragino Sans GB", "HarmonyOS Sans", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif',
      opacity: 100
    },
    animation: {
      enter: {
        preset: "rise",
        durationMs: 460,
        delayMs: 120
      },
      exit: {
        preset: "sink",
        durationMs: 220,
        delayMs: 40
      }
    },
    props: {
      text: "系统设置"
    }
  },
  {
    id: "title-accent",
    type: "rect",
    name: "玉青短横线",
    rect: {
      x: 120,
      y: 212,
      w: 72,
      h: 4
    },
    anchor: "t",
    style: {
      fill: "#7fd4c8",
      radius: 999,
      opacity: 100,
      customCss: "background-image: linear-gradient(90deg, #7fd4c8, #5eb8d4); box-shadow: 0 0 14px rgba(94,184,212,0.5);"
    },
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 420,
        delayMs: 190
      },
      exit: {
        preset: "shrink",
        durationMs: 180,
        delayMs: 20
      }
    }
  },
  {
    id: "close-btn",
    type: "button",
    name: "按钮_关闭当前界面",
    rect: {
      x: 1748,
      y: 118,
      w: 52,
      h: 52
    },
    anchor: "tr",
    style: {
      fontSize: 22,
      color: "#dce8f2",
      fill: "rgba(120, 150, 180, 0.06)",
      borderColor: "rgba(150, 180, 210, 0.14)",
      borderWidth: 1,
      radius: 10,
      backdropBlur: 10,
      opacity: 100,
      customCss: "box-shadow: inset 0 1px 0 rgba(200,225,245,0.06), 0 4px 14px rgba(4,10,18,0.4); transition: transform 180ms cubic-bezier(0.22,1,0.36,1), background 180ms, border-color 180ms, box-shadow 180ms; &:hover { background: rgba(127,212,200,0.12); border-color: rgba(127,212,200,0.55); box-shadow: 0 0 22px rgba(94,184,212,0.3); transform: rotate(90deg); }"
    },
    animation: {
      enter: {
        preset: "scale",
        durationMs: 320,
        delayMs: 200
      },
      exit: {
        preset: "shrink",
        durationMs: 180,
        delayMs: 0
      }
    },
    props: {
      text: "✕"
    },
    events: {
      onClick: {
        type: "ui.close"
      }
    }
  },
  {
    id: "settings-tabs",
    type: "tabs",
    name: "页签_设置分组",
    rect: {
      x: 210,
      y: 264,
      w: 1500,
      h: 40
    },
    anchor: "tl",
    style: {
      fontSize: 15,
      color: "#e8edf2",
      radius: 8,
      opacity: 100,
      fontFamily: '"Plus Jakarta Sans", "Noto Sans SC", "PingFang SC", sans-serif'
    },
    animation: {
      enter: {
        preset: "rise",
        durationMs: 380,
        delayMs: 220
      },
      exit: {
        preset: "sink",
        durationMs: 200,
        delayMs: 0
      }
    },
    props: {
      tabs: [
        "音量",
        "文本与播放",
        "显示"
      ],
      activeIndex: 0,
      gap: 8
    }
  },
  {
    id: "vol-card",
    type: "rect",
    name: "矩形_音量卡片",
    rect: {
      x: 210,
      y: 314,
      w: 1500,
      h: 316
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "rise",
        durationMs: 340,
        delayMs: 80
      },
      exit: {
        preset: "sink",
        durationMs: 200,
        delayMs: 0
      }
    },
    style: {
      fill: "rgba(120,150,180,0.06)",
      radius: 12,
      opacity: 100
    },
    tab: {
      of: "settings-tabs",
      index: 0
    }
  },
  {
    id: "vol-title",
    type: "text",
    name: "文字_音量",
    rect: {
      x: 250,
      y: 334,
      w: 200,
      h: 32
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "fade",
        durationMs: 280,
        delayMs: 130
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 20,
      color: "#e8edf2",
      letterSpacing: 4,
      opacity: 100
    },
    props: {
      text: "音量"
    },
    tab: {
      of: "settings-tabs",
      index: 0
    }
  },
  {
    id: "vol-master-label",
    type: "text",
    name: "文字_主音量",
    rect: {
      x: 250,
      y: 382,
      w: 320,
      h: 44
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 300,
        delayMs: 180
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      color: "rgba(220,232,242,0.82)",
      opacity: 100
    },
    props: {
      text: "主音量"
    },
    tab: {
      of: "settings-tabs",
      index: 0
    }
  },
  {
    id: "vol-master-slider",
    type: "slider",
    name: "滑块_主音量",
    rect: {
      x: 630,
      y: 382,
      w: 1040,
      h: 44
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "fade",
        durationMs: 320,
        delayMs: 200
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      opacity: 100
    },
    props: {
      bind: "masterVolume",
      value: 80,
      showValue: !0
    },
    tab: {
      of: "settings-tabs",
      index: 0
    }
  },
  {
    id: "vol-bgm-label",
    type: "text",
    name: "文字_背景音乐",
    rect: {
      x: 250,
      y: 444,
      w: 320,
      h: 44
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 300,
        delayMs: 230
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      color: "rgba(220,232,242,0.82)",
      opacity: 100
    },
    props: {
      text: "背景音乐"
    },
    tab: {
      of: "settings-tabs",
      index: 0
    }
  },
  {
    id: "vol-bgm-slider",
    type: "slider",
    name: "滑块_背景音乐音量",
    rect: {
      x: 630,
      y: 444,
      w: 1040,
      h: 44
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "fade",
        durationMs: 320,
        delayMs: 250
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      opacity: 100
    },
    props: {
      bind: "bgmVolume",
      value: 80,
      showValue: !0
    },
    tab: {
      of: "settings-tabs",
      index: 0
    }
  },
  {
    id: "vol-se-label",
    type: "text",
    name: "文字_音效",
    rect: {
      x: 250,
      y: 506,
      w: 320,
      h: 44
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 300,
        delayMs: 280
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      color: "rgba(220,232,242,0.82)",
      opacity: 100
    },
    props: {
      text: "音效"
    },
    tab: {
      of: "settings-tabs",
      index: 0
    }
  },
  {
    id: "vol-se-slider",
    type: "slider",
    name: "滑块_音效音量",
    rect: {
      x: 630,
      y: 506,
      w: 1040,
      h: 44
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "fade",
        durationMs: 320,
        delayMs: 300
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      opacity: 100
    },
    props: {
      bind: "seVolume",
      value: 80,
      showValue: !0
    },
    tab: {
      of: "settings-tabs",
      index: 0
    }
  },
  {
    id: "vol-voice-label",
    type: "text",
    name: "文字_语音",
    rect: {
      x: 250,
      y: 568,
      w: 320,
      h: 44
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 300,
        delayMs: 330
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      color: "rgba(220,232,242,0.82)",
      opacity: 100
    },
    props: {
      text: "语音"
    },
    tab: {
      of: "settings-tabs",
      index: 0
    }
  },
  {
    id: "vol-voice-slider",
    type: "slider",
    name: "滑块_语音音量",
    rect: {
      x: 630,
      y: 568,
      w: 1040,
      h: 44
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "fade",
        durationMs: 320,
        delayMs: 350
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      opacity: 100
    },
    props: {
      bind: "voiceVolume",
      value: 80,
      showValue: !0
    },
    tab: {
      of: "settings-tabs",
      index: 0
    }
  },
  {
    id: "text-card",
    type: "rect",
    name: "矩形_文本与播放卡片",
    rect: {
      x: 210,
      y: 314,
      w: 1500,
      h: 310
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "rise",
        durationMs: 340,
        delayMs: 80
      },
      exit: {
        preset: "sink",
        durationMs: 200,
        delayMs: 0
      }
    },
    style: {
      fill: "rgba(120,150,180,0.06)",
      radius: 12,
      opacity: 100
    },
    tab: {
      of: "settings-tabs",
      index: 1
    }
  },
  {
    id: "text-title",
    type: "text",
    name: "文字_文本与播放",
    rect: {
      x: 250,
      y: 334,
      w: 240,
      h: 32
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "fade",
        durationMs: 280,
        delayMs: 130
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 20,
      color: "#e8edf2",
      letterSpacing: 4,
      opacity: 100
    },
    props: {
      text: "文本与播放"
    },
    tab: {
      of: "settings-tabs",
      index: 1
    }
  },
  {
    id: "speed-label",
    type: "text",
    name: "文字_文字速度",
    rect: {
      x: 250,
      y: 380,
      w: 320,
      h: 44
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 300,
        delayMs: 180
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      color: "rgba(220,232,242,0.82)",
      opacity: 100
    },
    props: {
      text: "文字速度"
    },
    tab: {
      of: "settings-tabs",
      index: 1
    }
  },
  {
    id: "speed-slider",
    type: "slider",
    name: "滑块_文字速度",
    rect: {
      x: 630,
      y: 380,
      w: 1040,
      h: 44
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "fade",
        durationMs: 320,
        delayMs: 200
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      opacity: 100
    },
    props: {
      bind: "textSpeed",
      value: 50,
      showValue: !0
    },
    tab: {
      of: "settings-tabs",
      index: 1
    }
  },
  {
    id: "auto-speed-label",
    type: "text",
    name: "文字_自动模式速度",
    rect: {
      x: 250,
      y: 442,
      w: 320,
      h: 44
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 300,
        delayMs: 230
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      color: "rgba(220,232,242,0.82)",
      opacity: 100
    },
    props: {
      text: "自动模式速度"
    },
    tab: {
      of: "settings-tabs",
      index: 1
    }
  },
  {
    id: "auto-speed-slider",
    type: "slider",
    name: "滑块_自动模式速度",
    rect: {
      x: 630,
      y: 442,
      w: 1040,
      h: 44
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "fade",
        durationMs: 320,
        delayMs: 250
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      opacity: 100
    },
    props: {
      bind: "autoModeTextSpeed",
      value: 50,
      showValue: !0
    },
    tab: {
      of: "settings-tabs",
      index: 1
    }
  },
  {
    id: "skip-label",
    type: "text",
    name: "文字_跳过模式",
    rect: {
      x: 250,
      y: 504,
      w: 320,
      h: 44
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 300,
        delayMs: 280
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      color: "rgba(220,232,242,0.82)",
      opacity: 100
    },
    props: {
      text: "跳过模式"
    },
    tab: {
      of: "settings-tabs",
      index: 1
    }
  },
  {
    id: "skip-select",
    type: "select",
    name: "下拉_跳过模式",
    rect: {
      x: 630,
      y: 502,
      w: 320,
      h: 48
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "fade",
        durationMs: 320,
        delayMs: 300
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      color: "#e8edf2",
      radius: 6,
      opacity: 100
    },
    props: {
      options: [
        "仅跳过已读",
        "跳过全部"
      ],
      value: 0,
      bind: "skipMode"
    },
    tab: {
      of: "settings-tabs",
      index: 1
    }
  },
  {
    id: "stopvoice-label",
    type: "text",
    name: "文字_下句中断语音",
    rect: {
      x: 250,
      y: 562,
      w: 320,
      h: 44
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 300,
        delayMs: 330
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      color: "rgba(220,232,242,0.82)",
      opacity: 100
    },
    props: {
      text: "下句中断语音"
    },
    tab: {
      of: "settings-tabs",
      index: 1
    }
  },
  {
    id: "stopvoice-switch",
    type: "switch",
    name: "开关_下句中断语音",
    rect: {
      x: 630,
      y: 560,
      w: 96,
      h: 48
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "scale",
        durationMs: 280,
        delayMs: 350
      },
      exit: {
        preset: "shrink",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      opacity: 100
    },
    props: {
      bind: "stopVoiceOnNextDialogue",
      value: !0
    },
    tab: {
      of: "settings-tabs",
      index: 1
    }
  },
  {
    id: "display-card",
    type: "rect",
    name: "矩形_显示卡片",
    refId: "display-card",
    rect: {
      x: 210,
      y: 314,
      w: 1500,
      h: 120
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "rise",
        durationMs: 340,
        delayMs: 80
      },
      exit: {
        preset: "sink",
        durationMs: 200,
        delayMs: 0
      }
    },
    style: {
      fill: "rgba(120,150,180,0.06)",
      radius: 12,
      opacity: 100
    },
    tab: {
      of: "settings-tabs",
      index: 2
    }
  },
  {
    id: "display-title",
    type: "text",
    name: "文字_显示",
    refId: "display-title",
    rect: {
      x: 250,
      y: 332,
      w: 200,
      h: 30
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "fade",
        durationMs: 280,
        delayMs: 130
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 20,
      color: "#e8edf2",
      letterSpacing: 4,
      opacity: 100
    },
    props: {
      text: "显示"
    },
    tab: {
      of: "settings-tabs",
      index: 2
    }
  },
  {
    id: "display-label",
    type: "text",
    name: "文字_全屏",
    refId: "display-label",
    rect: {
      x: 250,
      y: 376,
      w: 320,
      h: 44
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 300,
        delayMs: 180
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      color: "rgba(220,232,242,0.82)",
      opacity: 100
    },
    props: {
      text: "全屏"
    },
    tab: {
      of: "settings-tabs",
      index: 2
    }
  },
  {
    id: "display-switch",
    type: "switch",
    name: "开关_全屏",
    refId: "display-switch",
    rect: {
      x: 630,
      y: 374,
      w: 96,
      h: 48
    },
    anchor: "t",
    animation: {
      enter: {
        preset: "scale",
        durationMs: 280,
        delayMs: 200
      },
      exit: {
        preset: "shrink",
        durationMs: 160,
        delayMs: 0
      }
    },
    style: {
      opacity: 100
    },
    props: {
      bind: "fullscreen",
      value: !1
    },
    tab: {
      of: "settings-tabs",
      index: 2
    }
  },
  {
    id: "reset-btn",
    type: "button",
    name: "按钮_恢复默认",
    refId: "reset-btn",
    rect: {
      x: 210,
      y: 1014,
      w: 168,
      h: 52
    },
    anchor: "b",
    animation: {
      enter: {
        preset: "scale",
        durationMs: 300,
        delayMs: 300
      },
      exit: {
        preset: "shrink",
        durationMs: 180,
        delayMs: 0
      }
    },
    style: {
      fontSize: 18,
      color: "rgba(220,232,242,0.85)",
      fill: "rgba(120,150,180,0.06)",
      borderColor: "rgba(220,232,242,0.25)",
      borderWidth: 1,
      radius: 6,
      letterSpacing: 4,
      opacity: 100
    },
    props: {
      text: "恢复默认"
    },
    events: {
      onClick: {
        type: "config.reset"
      }
    }
  },
  {
    id: "button-mrvvgpma-1",
    type: "button",
    name: "按钮_退出游戏",
    rect: {
      x: 1350,
      y: 1014,
      w: 168,
      h: 52
    },
    anchor: "b",
    style: {
      fontSize: 18,
      color: "rgba(220,232,242,0.85)",
      fill: "rgba(120,150,180,0.06)",
      borderColor: "rgba(220,232,242,0.25)",
      borderWidth: 1,
      radius: 6,
      letterSpacing: 4,
      opacity: 100
    },
    animation: {
      enter: {
        preset: "scale",
        durationMs: 300,
        delayMs: 300
      },
      exit: {
        preset: "shrink",
        durationMs: 180,
        delayMs: 0
      }
    },
    props: {
      text: "退出游戏"
    },
    events: {
      onClick: {
        type: "system.exit"
      }
    }
  },
  {
    id: "button-mrvvhi2h-2",
    type: "button",
    name: "按钮_返回标题",
    rect: {
      x: 1542,
      y: 1014,
      w: 168,
      h: 52
    },
    anchor: "b",
    style: {
      fontSize: 18,
      color: "rgba(220,232,242,0.85)",
      fill: "rgba(120,150,180,0.06)",
      borderColor: "rgba(220,232,242,0.25)",
      borderWidth: 1,
      radius: 6,
      letterSpacing: 4,
      opacity: 100
    },
    animation: {
      enter: {
        preset: "scale",
        durationMs: 300,
        delayMs: 300
      },
      exit: {
        preset: "shrink",
        durationMs: 180,
        delayMs: 0
      }
    },
    props: {
      text: "返回标题画面"
    },
    events: {
      onClick: {
        type: "system.openSlot",
        slot: "title"
      }
    }
  }
], yr = {
  version: Ft,
  name: It,
  canvas: Ot,
  elements: Pt
}, mr = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  canvas: Ot,
  default: yr,
  elements: Pt,
  name: It,
  version: Ft
}, Symbol.toStringTag, { value: "Module" })), Lt = 1, Tt = "标题画面", zt = {
  width: 1920,
  height: 1080
}, Et = [
  {
    id: "vignette",
    type: "rect",
    name: "矩形_暗角遮罩",
    rect: {
      x: 0,
      y: 0,
      w: 1920,
      h: 1080
    },
    anchor: "c",
    style: {
      fill: "transparent",
      radius: 0,
      opacity: 100,
      customCss: "background: radial-gradient(ellipse 70% 80% at 0% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 55%), radial-gradient(ellipse 80% 60% at 100% 100%, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 78%, rgba(0,0,0,0.22) 100%); pointer-events: none;"
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 600,
        delayMs: 0
      },
      exit: {
        preset: "fade",
        durationMs: 260,
        delayMs: 160
      }
    }
  },
  {
    id: "top-line",
    type: "line",
    name: "线条_顶部细线",
    rect: {
      x: 48,
      y: 40,
      w: 1824,
      h: 12
    },
    anchor: "t",
    style: {
      color: "rgba(255,255,255,0.14)",
      opacity: 60
    },
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 500,
        delayMs: 60
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 100
      }
    },
    props: {
      thickness: 1,
      lineStyle: "solid"
    }
  },
  {
    id: "version-tag",
    type: "text",
    name: "文字_版本号",
    rect: {
      x: 1536,
      y: 56,
      w: 320,
      h: 24
    },
    anchor: "tr",
    style: {
      fontSize: 10,
      color: "rgba(245,245,247,0.38)",
      letterSpacing: 6,
      textAlign: "right",
      opacity: 100,
      customCss: 'text-transform: uppercase; font-family: "JetBrains Mono", "SF Mono", "Menlo", "Monaco", "Consolas", monospace;'
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 320,
        delayMs: 140
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 100
      }
    },
    props: {
      text: "AVG · ENGINE"
    }
  },
  {
    id: "studio-tag",
    type: "text",
    name: "文字_工作室标签",
    rect: {
      x: 80,
      y: 984,
      w: 400,
      h: 24
    },
    anchor: "bl",
    style: {
      fontSize: 10,
      color: "#d4a574",
      letterSpacing: 7,
      opacity: 100,
      customCss: 'text-transform: uppercase; font-family: "JetBrains Mono", "SF Mono", "Menlo", "Monaco", "Consolas", monospace;'
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 360,
        delayMs: 220
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 80
      }
    },
    props: {
      text: "— LetsGal Studio"
    }
  },
  {
    id: "copyright",
    type: "text",
    name: "文字_版权",
    rect: {
      x: 1536,
      y: 984,
      w: 320,
      h: 24
    },
    anchor: "br",
    style: {
      fontSize: 10,
      color: "rgba(245,245,247,0.38)",
      letterSpacing: 4,
      textAlign: "right",
      opacity: 70,
      customCss: 'text-transform: uppercase; font-family: "JetBrains Mono", "SF Mono", "Menlo", "Monaco", "Consolas", monospace;'
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 360,
        delayMs: 260
      },
      exit: {
        preset: "fade",
        durationMs: 160,
        delayMs: 80
      }
    },
    props: {
      text: "© 2026"
    }
  },
  {
    id: "menu-num-1",
    type: "text",
    name: "文字_编号01",
    rect: {
      x: 96,
      y: 424,
      w: 32,
      h: 32
    },
    anchor: "l",
    style: {
      fontSize: 14,
      color: "rgba(245,245,247,0.38)",
      letterSpacing: 3,
      fontWeight: 600,
      opacity: 100,
      customCss: 'font-family: "JetBrains Mono", "SF Mono", "Menlo", "Monaco", "Consolas", monospace;'
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 260,
        delayMs: 180
      },
      exit: {
        preset: "fade",
        durationMs: 140,
        delayMs: 80
      }
    },
    props: {
      text: "01"
    }
  },
  {
    id: "menu-start",
    type: "button",
    name: "按钮_开始游戏",
    rect: {
      x: 144,
      y: 400,
      w: 520,
      h: 80
    },
    anchor: "l",
    style: {
      fontSize: 56,
      color: "#f5f5f7",
      fill: "transparent",
      borderWidth: 0,
      fontWeight: 600,
      letterSpacing: 1,
      textAlign: "left",
      opacity: 100,
      customCss: 'font-family: "Plus Jakarta Sans", "M PLUS Rounded 1c", "PingFang SC", "Hiragino Sans GB", "HarmonyOS Sans", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif; justify-content: flex-start; text-shadow: 0 2px 24px rgba(0,0,0,0.8); transition: color .18s cubic-bezier(0.22,1,0.36,1), transform .18s cubic-bezier(0.22,1,0.36,1); &:hover { color: #d4a574; transform: translateX(10px); }'
    },
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 420,
        delayMs: 200
      },
      exit: {
        preset: "slide-left",
        durationMs: 200,
        delayMs: 80
      }
    },
    props: {
      text: "开始游戏"
    },
    events: {
      onClick: {
        type: "system.newGame"
      }
    }
  },
  {
    id: "menu-num-2",
    type: "text",
    name: "文字_编号02",
    rect: {
      x: 96,
      y: 520,
      w: 32,
      h: 32
    },
    anchor: "l",
    style: {
      fontSize: 14,
      color: "rgba(245,245,247,0.38)",
      letterSpacing: 3,
      fontWeight: 600,
      opacity: 100,
      customCss: 'font-family: "JetBrains Mono", "SF Mono", "Menlo", "Monaco", "Consolas", monospace;'
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 260,
        delayMs: 250
      },
      exit: {
        preset: "fade",
        durationMs: 140,
        delayMs: 60
      }
    },
    props: {
      text: "02"
    }
  },
  {
    id: "menu-load",
    type: "button",
    name: "按钮_读取存档",
    rect: {
      x: 144,
      y: 496,
      w: 520,
      h: 80
    },
    anchor: "l",
    style: {
      fontSize: 56,
      color: "#f5f5f7",
      fill: "transparent",
      borderWidth: 0,
      fontWeight: 600,
      letterSpacing: 1,
      textAlign: "left",
      opacity: 100,
      customCss: 'font-family: "Plus Jakarta Sans", "M PLUS Rounded 1c", "PingFang SC", "Hiragino Sans GB", "HarmonyOS Sans", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif; justify-content: flex-start; text-shadow: 0 2px 24px rgba(0,0,0,0.8); transition: color .18s cubic-bezier(0.22,1,0.36,1), transform .18s cubic-bezier(0.22,1,0.36,1); &:hover { color: #d4a574; transform: translateX(10px); }'
    },
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 420,
        delayMs: 270
      },
      exit: {
        preset: "slide-left",
        durationMs: 200,
        delayMs: 60
      }
    },
    props: {
      text: "读取存档"
    },
    events: {
      onClick: {
        type: "system.openSlot",
        slot: "load"
      }
    }
  },
  {
    id: "menu-num-3",
    type: "text",
    name: "文字_编号03",
    rect: {
      x: 96,
      y: 616,
      w: 32,
      h: 32
    },
    anchor: "l",
    style: {
      fontSize: 14,
      color: "rgba(245,245,247,0.38)",
      letterSpacing: 3,
      fontWeight: 600,
      opacity: 100,
      customCss: 'font-family: "JetBrains Mono", "SF Mono", "Menlo", "Monaco", "Consolas", monospace;'
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 260,
        delayMs: 320
      },
      exit: {
        preset: "fade",
        durationMs: 140,
        delayMs: 40
      }
    },
    props: {
      text: "03"
    }
  },
  {
    id: "menu-gallery",
    type: "button",
    name: "按钮_鉴赏",
    rect: {
      x: 144,
      y: 592,
      w: 520,
      h: 80
    },
    anchor: "l",
    style: {
      fontSize: 56,
      color: "#f5f5f7",
      fill: "transparent",
      borderWidth: 0,
      fontWeight: 600,
      letterSpacing: 1,
      textAlign: "left",
      opacity: 100,
      customCss: 'font-family: "Plus Jakarta Sans", "M PLUS Rounded 1c", "PingFang SC", "Hiragino Sans GB", "HarmonyOS Sans", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif; justify-content: flex-start; text-shadow: 0 2px 24px rgba(0,0,0,0.8); transition: color .18s cubic-bezier(0.22,1,0.36,1), transform .18s cubic-bezier(0.22,1,0.36,1); &:hover { color: #d4a574; transform: translateX(10px); }'
    },
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 420,
        delayMs: 340
      },
      exit: {
        preset: "slide-left",
        durationMs: 200,
        delayMs: 40
      }
    },
    props: {
      text: "鉴赏"
    },
    events: {
      onClick: {
        type: "system.openSlot",
        slot: "gallery"
      }
    }
  },
  {
    id: "menu-num-4",
    type: "text",
    name: "文字_编号04",
    rect: {
      x: 96,
      y: 712,
      w: 32,
      h: 32
    },
    anchor: "l",
    style: {
      fontSize: 14,
      color: "rgba(245,245,247,0.38)",
      letterSpacing: 3,
      fontWeight: 600,
      opacity: 100,
      customCss: 'font-family: "JetBrains Mono", "SF Mono", "Menlo", "Monaco", "Consolas", monospace;'
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 260,
        delayMs: 390
      },
      exit: {
        preset: "fade",
        durationMs: 140,
        delayMs: 20
      }
    },
    props: {
      text: "04"
    }
  },
  {
    id: "menu-settings",
    type: "button",
    name: "按钮_设置",
    rect: {
      x: 144,
      y: 688,
      w: 520,
      h: 80
    },
    anchor: "l",
    style: {
      fontSize: 56,
      color: "#f5f5f7",
      fill: "transparent",
      borderWidth: 0,
      fontWeight: 600,
      letterSpacing: 1,
      textAlign: "left",
      opacity: 100,
      customCss: 'font-family: "Plus Jakarta Sans", "M PLUS Rounded 1c", "PingFang SC", "Hiragino Sans GB", "HarmonyOS Sans", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif; justify-content: flex-start; text-shadow: 0 2px 24px rgba(0,0,0,0.8); transition: color .18s cubic-bezier(0.22,1,0.36,1), transform .18s cubic-bezier(0.22,1,0.36,1); &:hover { color: #d4a574; transform: translateX(10px); }'
    },
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 420,
        delayMs: 410
      },
      exit: {
        preset: "slide-left",
        durationMs: 200,
        delayMs: 20
      }
    },
    props: {
      text: "设置"
    },
    events: {
      onClick: {
        type: "system.openSlot",
        slot: "settings"
      }
    }
  },
  {
    id: "menu-num-5",
    type: "text",
    name: "文字_编号05",
    rect: {
      x: 96,
      y: 808,
      w: 32,
      h: 32
    },
    anchor: "l",
    style: {
      fontSize: 14,
      color: "rgba(245,245,247,0.38)",
      letterSpacing: 3,
      fontWeight: 600,
      opacity: 100,
      customCss: 'font-family: "JetBrains Mono", "SF Mono", "Menlo", "Monaco", "Consolas", monospace;'
    },
    animation: {
      enter: {
        preset: "fade",
        durationMs: 260,
        delayMs: 460
      },
      exit: {
        preset: "fade",
        durationMs: 140,
        delayMs: 0
      }
    },
    props: {
      text: "05"
    }
  },
  {
    id: "menu-exit",
    type: "button",
    name: "按钮_退出",
    rect: {
      x: 144,
      y: 784,
      w: 520,
      h: 80
    },
    anchor: "l",
    style: {
      fontSize: 56,
      color: "#f5f5f7",
      fill: "transparent",
      borderWidth: 0,
      fontWeight: 600,
      letterSpacing: 1,
      textAlign: "left",
      opacity: 100,
      customCss: 'font-family: "Plus Jakarta Sans", "M PLUS Rounded 1c", "PingFang SC", "Hiragino Sans GB", "HarmonyOS Sans", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif; justify-content: flex-start; text-shadow: 0 2px 24px rgba(0,0,0,0.8); transition: color .18s cubic-bezier(0.22,1,0.36,1), transform .18s cubic-bezier(0.22,1,0.36,1); &:hover { color: #d4a574; transform: translateX(10px); }'
    },
    animation: {
      enter: {
        preset: "slide-left",
        durationMs: 420,
        delayMs: 480
      },
      exit: {
        preset: "slide-left",
        durationMs: 200,
        delayMs: 0
      }
    },
    props: {
      text: "退出"
    },
    events: {
      onClick: {
        type: "system.exit"
      }
    }
  }
], br = {
  version: Lt,
  name: Tt,
  canvas: zt,
  elements: Et
}, hr = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  canvas: zt,
  default: br,
  elements: Et,
  name: Tt,
  version: Lt
}, Symbol.toStringTag, { value: "Module" })), Rt = 1, Bt = {
  width: 1920,
  height: 1080
}, Dt = [
  {
    id: "toolbar",
    type: "toolbar",
    rect: {
      x: 210,
      y: 1027,
      w: 1500,
      h: 48
    },
    anchor: "b",
    name: "对话工具栏",
    style: {
      fontSize: 18,
      color: "#e8edf2",
      fill: "#c6c695",
      borderColor: "rgba(127, 212, 200, 0.28)",
      borderWidth: 0,
      radius: 27,
      letterSpacing: 1,
      opacity: 100
    },
    animation: {
      enter: {
        preset: "rise",
        durationMs: 420,
        delayMs: 30
      },
      exit: {
        preset: "sink",
        durationMs: 220,
        delayMs: 0
      }
    },
    props: {
      items: [
        "skip",
        "auto",
        "save",
        "load",
        "quickSave",
        "quickLoad",
        "history",
        "settings",
        "hide"
      ],
      direction: "horizontal",
      align: "center",
      gap: 4,
      showLabels: !0,
      accentColor: "#7fd4c8",
      showFill: !1
    }
  }
], Wt = "对话工具栏", xr = {
  version: Rt,
  canvas: Bt,
  elements: Dt,
  name: Wt
}, vr = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  canvas: Bt,
  default: xr,
  elements: Dt,
  name: Wt,
  version: Rt
}, Symbol.toStringTag, { value: "Module" })), At = {
  id: "avg.internal.default-shell",
  name: "默认游戏壳",
  description: "标题/存档/历史/设置/工具栏及剧情选项、标准输入、消息弹层一体的默认游戏 UI。每个 UI 子模块都可单独替换。",
  author: "LetsGal Studio",
  version: "1.0.0",
  // 跟用户扩展同形态:vite build 出 dist/index.mjs,加载方按 manifest.entry 找。
  // 历史上(2026-05 前)这里写的是 "<internal>",当时 default-shell 走 TS
  // 源码直接 import 进 Studio renderer bundle 的路径;2026-05-15 全栈统一后
  // 走真正的 ESM bundle 加载链路,entry 也跟着规范化。
  entry: "dist/index.mjs",
  // SDK 契约当前停在 1.x(src/sdk/constants.ts 的 SDK_VERSION = "1.0.0");
  // 历史上这里误写成 ">=2.0.0",2026-06 加载时兼容校验落地前理顺为 1.x 声明。
  sdkVersion: ">=1.0.0",
  // 2026-05 Internal Extension Points:DefaultShell 是引擎内置兜底扩展,
  // 不可禁用、不可卸载。仅 avg.internal.* namespace 可声明 builtin: true。
  // 详见 /docs/plans/2026-05-14-internal-extension-points-design.md §5.1
  builtin: !0,
  contributes: {
    dialogueBoxStyles: [
      {
        id: "landing",
        name: "默认对话框",
        description: "LetsGal 的唯一系统对话框基线。项目未选择其它扩展样式时使用。",
        visualUI: "dialogue-box",
        dialogueBox: {}
      }
    ]
  }
  // 静态 manifest.actions 字段已在 2026-05 设计中废弃,扩展贡献的 action
  // 通过 onRegister 阶段调 ctx.input.registerAction(...) 注册即可。
}, t = {
  // ---- color ----
  bgOverlay: "rgba(11, 13, 16, 0.82)",
  bgOverlayStrong: "rgba(11, 13, 16, 0.92)",
  bgSurface: "rgba(255, 255, 255, 0.04)",
  bgElevated: "rgba(255, 255, 255, 0.07)",
  bgSunken: "rgba(0, 0, 0, 0.28)",
  borderSubtle: "rgba(255, 255, 255, 0.08)",
  borderRegular: "rgba(255, 255, 255, 0.14)",
  borderStrong: "rgba(255, 255, 255, 0.24)",
  borderAccent: "rgba(212, 165, 116, 0.55)",
  textPrimary: "#f5f5f7",
  textMuted: "rgba(245, 245, 247, 0.62)",
  textFaint: "rgba(245, 245, 247, 0.38)",
  textOnAccent: "#1a1410",
  accent: "#d4a574",
  accentSoft: "rgba(212, 165, 116, 0.16)",
  accentGlow: "rgba(212, 165, 116, 0.32)",
  danger: "#e0635a",
  dangerSoft: "rgba(224, 99, 90, 0.14)",
  // ---- typography ----
  // 风格:现代圆润黑体(geometric rounded sans),不要衬线/宋体
  // - fontDisplay  : 大字标题用,粗+圆润,系统圆润字体优先
  // - fontUI       : 正文/按钮用,中粗黑体
  // - fontMono     : 数字/timestamp,等宽
  fontDisplay: '"Plus Jakarta Sans", "M PLUS Rounded 1c", "PingFang SC", "Hiragino Sans GB", "HarmonyOS Sans", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif',
  fontUI: '"Plus Jakarta Sans", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "HarmonyOS Sans", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
  fontMono: '"JetBrains Mono", "SF Mono", "Menlo", "Monaco", "Consolas", monospace',
  // ---- motion ----
  // quint-out 是公认最 silky 的 UI 缓动之一
  easeOut: "cubic-bezier(0.22, 1, 0.36, 1)",
  easeIn: "cubic-bezier(0.64, 0, 0.78, 0)",
  // 2026-05 提速:从 180/280/420 收紧到 140/220/320。
  // 原值整体偏慢一档,玩家反馈"重、迟钝"。新值与 Vercel/Linear 这类
  // 现代 UI 的节奏对齐,同时保留 quint-out 的丝滑感。
  durFast: 140,
  durBase: 220,
  durSlow: 320,
  // ---- spacing & radius ----
  radiusSm: 6,
  radiusMd: 10,
  radiusLg: 16,
  radiusPill: 999
}, we = "avg-default-shell-shared-style";
function Sr() {
  if (typeof document > "u" || document.getElementById(we)) return;
  const e = document.createElement("style");
  e.id = we, e.textContent = `
    /* overlay:只动 opacity,backdrop-filter 用 inline 写死避免合成层重建闪烁 */
    @keyframes avg-overlay-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes avg-overlay-out {
      from { opacity: 1; }
      to   { opacity: 0; }
    }
    @keyframes avg-content-rise {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes avg-content-fall {
      from { opacity: 1; transform: translateY(0); }
      to   { opacity: 0; transform: translateY(8px); }
    }
    @keyframes avg-stagger-rise {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes avg-title-reveal {
      from {
        opacity: 0;
        transform: translateY(18px);
        letter-spacing: 0.04em;
        filter: blur(6px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
        letter-spacing: 0.02em;
        filter: blur(0);
      }
    }
    @keyframes avg-page-slide-in-right {
      from { opacity: 0; transform: translateX(24px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes avg-page-slide-in-left {
      from { opacity: 0; transform: translateX(-24px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes avg-pulse-glow {
      0%, 100% { box-shadow: 0 0 0 0 rgba(212, 165, 116, 0); }
      50%      { box-shadow: 0 0 0 6px rgba(212, 165, 116, 0.06); }
    }
    @keyframes avg-row-rise {
      from { opacity: 0; transform: translateY(12px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes avg-card-rise {
      from { opacity: 0; transform: translateY(20px) scale(0.96); filter: blur(4px); }
      to   { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
    }
    @keyframes avg-header-slide {
      from { opacity: 0; transform: translateX(-16px); filter: blur(4px); }
      to   { opacity: 1; transform: translateX(0); filter: blur(0); }
    }
    @keyframes avg-line-expand {
      from { transform: scaleX(0); opacity: 0; }
      to   { transform: scaleX(1); opacity: 1; }
    }
    /* 工具栏按钮 active 态呼吸:用于标注当前处于 auto/skip 模式。
       双 keyframe 周期 2.4s,opacity + box-shadow 同步呼吸,
       动效柔和不抢戏。 */
    @keyframes avg-toolbar-active-breath {
      0%, 100% {
        opacity: 0.85;
        box-shadow: 0 0 0 0 rgba(212, 165, 116, 0.0);
      }
      50% {
        opacity: 1;
        box-shadow: 0 0 18px 2px rgba(212, 165, 116, 0.35);
      }
    }

    .avg-shell-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
    .avg-shell-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .avg-shell-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      transition: background 220ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .avg-shell-scrollbar::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.18);
    }

    @media (prefers-reduced-motion: reduce) {
      [class*="avg-anim"] { animation: none !important; }
    }
  `, document.head.appendChild(e);
}
Sr();
function H() {
  const [e, r] = _(!1), a = j(0), n = j(null), o = ge(() => {
    if (n.current !== null) return;
    const l = Date.now() - a.current, c = 80;
    l >= c ? r(!1) : n.current = window.setTimeout(() => {
      n.current = null, r(!1);
    }, c - l);
  }, []), s = ge(() => {
    n.current !== null && (window.clearTimeout(n.current), n.current = null), a.current = Date.now(), r(!0);
  }, []);
  return T(() => {
    if (!e) return;
    const l = () => o();
    return window.addEventListener("pointerup", l), window.addEventListener("pointercancel", l), () => {
      window.removeEventListener("pointerup", l), window.removeEventListener("pointercancel", l);
    };
  }, [e, o]), {
    pressed: e,
    handlers: {
      onPointerDown: s,
      onPointerLeave: o
    }
  };
}
var wr = Object.defineProperty, Mr = Object.getOwnPropertyDescriptor, kr = (e, r, a) => r in e ? wr(e, r, { enumerable: !0, configurable: !0, writable: !0, value: a }) : e[r] = a, $r = (e, r, a, n) => {
  for (var o = n > 1 ? void 0 : n ? Mr(r, a) : r, s = e.length - 1, l; s >= 0; s--)
    (l = e[s]) && (o = l(o) || o);
  return o;
}, _r = (e, r, a) => kr(e, r + "", a);
const Cr = [
  { key: "start", settingKey: "startLabel", defaultLabel: "开始游戏" },
  { key: "load", settingKey: "loadLabel", defaultLabel: "读取存档" },
  { key: "gallery", settingKey: "galleryLabel", defaultLabel: "鉴赏" },
  { key: "settings", settingKey: "settingsLabel", defaultLabel: "设置" },
  { key: "exit", settingKey: "exitLabel", defaultLabel: "退出" }
], Fr = () => {
  const e = K(), r = e.settings.get("showGallery") ?? !0, a = Cr.filter(
    (p) => p.key !== "gallery" || r
  ).map((p) => {
    const b = (e.settings.get(p.settingKey) ?? "").trim();
    return { key: p.key, label: b || p.defaultLabel };
  }), [n, o] = _(!1), [s, l] = _(null), c = (p) => {
    o(!0), window.setTimeout(p, t.durBase);
  }, d = (p) => {
    p === "start" ? c(() => e.ui.hide("title-screen")) : p === "load" ? e.system.invoke(L.Load, { mode: "load", source: "title" }) : p === "gallery" ? e.system.invoke(L.Gallery) : p === "settings" ? e.system.invoke(L.Settings) : p === "exit" && c(() => e.game.exit());
  }, [f, u] = _(!1);
  T(() => {
    const p = requestAnimationFrame(() => u(!0));
    return () => cancelAnimationFrame(p);
  }, []);
  const g = f && !n;
  return /* @__PURE__ */ x(
    "div",
    {
      style: {
        position: "absolute",
        inset: 0,
        backgroundColor: "transparent",
        color: t.textPrimary,
        fontFamily: t.fontUI,
        overflow: "hidden",
        opacity: g ? 1 : 0,
        transition: `opacity ${t.durBase}ms ${t.easeOut}`
      },
      children: [
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              position: "absolute",
              inset: 0,
              background: `
            radial-gradient(ellipse 70% 80% at 0% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 55%),
            radial-gradient(ellipse 80% 60% at 100% 100%, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0) 60%),
            linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 78%, rgba(0,0,0,0.22) 100%)
          `,
              pointerEvents: "none",
              opacity: g ? 1 : 0,
              transition: `opacity ${t.durSlow}ms ${t.easeOut}`
            }
          }
        ),
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              position: "absolute",
              top: 40,
              left: "50%",
              height: 1,
              background: `linear-gradient(90deg, transparent 0%, ${t.borderRegular} 30%, ${t.borderRegular} 70%, transparent 100%)`,
              width: g ? "calc(100% - 96px)" : 0,
              transform: "translateX(-50%)",
              transition: `width ${t.durSlow}ms ${t.easeOut} 50ms`,
              opacity: 0.6
            }
          }
        ),
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              position: "absolute",
              top: 56,
              right: 64,
              fontFamily: t.fontMono,
              fontSize: 10,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: t.textFaint,
              opacity: g ? 1 : 0,
              transition: `opacity ${t.durSlow}ms ${t.easeOut} 140ms`
            },
            children: "AVG · ENGINE"
          }
        ),
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              position: "absolute",
              bottom: 48,
              left: 80,
              fontFamily: t.fontMono,
              fontSize: 10,
              letterSpacing: "0.40em",
              textTransform: "uppercase",
              color: t.accent,
              opacity: g ? 1 : 0,
              transform: g ? "translateY(0)" : "translateY(6px)",
              transition: `all ${t.durSlow}ms ${t.easeOut} 130ms`
            },
            children: "— LetsGal Studio"
          }
        ),
        /* @__PURE__ */ x(
          "div",
          {
            style: {
              position: "absolute",
              bottom: 48,
              right: 64,
              fontFamily: t.fontMono,
              fontSize: 10,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: t.textFaint,
              opacity: g ? 0.7 : 0,
              transition: `opacity ${t.durSlow}ms ${t.easeOut} 160ms`
            },
            children: [
              "© ",
              (/* @__PURE__ */ new Date()).getFullYear()
            ]
          }
        ),
        /* @__PURE__ */ i(
          "nav",
          {
            "aria-label": "主菜单",
            style: {
              position: "absolute",
              left: 96,
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              flexDirection: "column",
              gap: 8
            },
            children: a.map((p, b) => /* @__PURE__ */ i(
              Ir,
              {
                index: b,
                label: p.label,
                isHover: s === p.key,
                isOtherHover: s !== null && s !== p.key,
                visible: g,
                onMouseEnter: () => l(p.key),
                onMouseLeave: () => l(null),
                onClick: () => d(p.key)
              },
              p.key
            ))
          }
        )
      ]
    }
  );
}, Ir = ({
  index: e,
  label: r,
  isHover: a,
  isOtherHover: n,
  visible: o,
  onMouseEnter: s,
  onMouseLeave: l,
  onClick: c
}) => {
  const d = H(), f = o ? d.pressed ? 4 : a ? 10 : 0 : -16;
  return /* @__PURE__ */ x(
    "button",
    {
      onMouseEnter: s,
      onMouseLeave: (u) => {
        l(), d.handlers.onPointerLeave(u);
      },
      onPointerDown: d.handlers.onPointerDown,
      onClick: c,
      style: {
        position: "relative",
        appearance: "none",
        background: "transparent",
        border: "none",
        color: d.pressed || a ? t.accent : t.textPrimary,
        fontFamily: t.fontDisplay,
        fontSize: "clamp(36px, 4.2vw, 56px)",
        fontWeight: 600,
        lineHeight: 1.15,
        letterSpacing: "0.01em",
        padding: "12px 0 12px 96px",
        textAlign: "left",
        cursor: "default",
        textShadow: "0 2px 24px rgba(0,0,0,0.8)",
        opacity: o ? n ? 0.4 : 1 : 0,
        transform: `translateX(${f}px) scale(${d.pressed ? 0.985 : 1})`,
        transformOrigin: "left center",
        filter: d.pressed ? "brightness(1.1)" : "brightness(1)",
        transition: `color ${t.durFast}ms ${t.easeOut}, transform ${t.durFast}ms ${t.easeOut}, opacity ${t.durBase}ms ${t.easeOut}, filter ${t.durFast}ms ${t.easeOut}`,
        animation: o ? `avg-stagger-rise ${t.durSlow}ms ${t.easeOut} ${360 + e * 55}ms both` : "none",
        whiteSpace: "nowrap",
        userSelect: "none"
      },
      children: [
        /* @__PURE__ */ i(
          "span",
          {
            "aria-hidden": !0,
            style: {
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
              fontFamily: t.fontMono,
              fontSize: 14,
              letterSpacing: "0.18em",
              color: a ? t.accent : t.textFaint,
              fontWeight: 600,
              transition: `color ${t.durBase}ms ${t.easeOut}`,
              fontVariantNumeric: "tabular-nums"
            },
            children: String(e + 1).padStart(2, "0")
          }
        ),
        /* @__PURE__ */ i(
          "span",
          {
            "aria-hidden": !0,
            style: {
              position: "absolute",
              left: 36,
              top: "50%",
              height: 2,
              background: t.accent,
              width: a ? 52 : 0,
              transform: "translateY(-50%)",
              transition: `width ${t.durBase}ms ${t.easeOut}`,
              boxShadow: a ? `0 0 12px ${t.accentGlow}` : "none",
              borderRadius: 999
            }
          }
        ),
        r
      ]
    }
  );
};
let ye = class extends J {
  render() {
    return { component: Fr, props: {} };
  }
};
_r(ye, "settings", X((e) => ({
  startLabel: e.string("「开始游戏」按钮文本").default("开始游戏"),
  loadLabel: e.string("「读取存档」按钮文本").default("读取存档"),
  showGallery: e.boolean("显示「鉴赏」菜单项").default(!0),
  galleryLabel: e.string("「鉴赏」按钮文本").default("鉴赏").enabledWhen("showGallery"),
  settingsLabel: e.string("「设置」按钮文本").default("设置"),
  exitLabel: e.string("「退出」按钮文本").default("退出")
})));
ye = $r([
  q({
    id: "title-screen",
    label: "标题画面",
    exposeUI: !1,
    // 1.6.0 起只导出 ui/title-screen.json,React 版不再进入 UI 列表
    // 2026-05 Internal Extension Points §6.1:声明本 UI 实现哪些系统槽位。
    supportsSlot: L.Title
  })
], ye);
function P(e) {
  const [r, a] = _(!1), n = e.delay ?? 0, o = e.duration ?? t.durSlow;
  return T(() => {
    const l = window.setTimeout(() => a(!0), n);
    return () => window.clearTimeout(l);
  }, [n]), r ? {
    opacity: 1,
    transform: "none",
    filter: "none",
    transition: `opacity ${o}ms ${t.easeOut}, transform ${o}ms ${t.easeOut}, filter ${o}ms ${t.easeOut}`
  } : {
    ...e.hidden,
    transition: "none"
  };
}
function se(e) {
  const [r, a] = _(!1);
  return T(() => {
    const n = window.setTimeout(() => a(!0), 0);
    return () => window.clearTimeout(n);
  }, []), e === "exit" ? {
    opacity: 0,
    transition: `opacity ${t.durFast}ms ${t.easeIn}`
  } : r ? {
    opacity: 1,
    transition: `opacity ${t.durBase}ms ${t.easeOut}`
  } : { opacity: 0, transition: "none" };
}
function ie(e, r, a = t.durFast) {
  const [n, o] = _("shown"), s = ge(() => {
    o((l) => l === "exit" ? l : "exit"), window.setTimeout(() => {
      e.ui.hide(r);
    }, a);
  }, [e, r, a]);
  return { phase: n, requestClose: s };
}
const le = ({ eyebrow: e, title: r, rightSlot: a }) => {
  const n = P({
    hidden: { opacity: 0, transform: "translateX(-16px)" },
    delay: 40
  }), o = P({
    hidden: { opacity: 0, transform: "scaleX(0)" },
    delay: 180
  }), s = P({
    hidden: { opacity: 0, transform: "translateY(10px)" },
    delay: 120
  });
  return /* @__PURE__ */ x(
    "header",
    {
      style: {
        padding: "48px 80px 32px",
        display: "flex",
        alignItems: "flex-end",
        gap: 24
      },
      children: [
        /* @__PURE__ */ x("div", { style: n, children: [
          /* @__PURE__ */ i(
            "div",
            {
              style: {
                fontFamily: t.fontMono,
                fontSize: 11,
                letterSpacing: "0.36em",
                textTransform: "uppercase",
                color: t.accent,
                marginBottom: 12,
                fontWeight: 600
              },
              children: e
            }
          ),
          /* @__PURE__ */ i(
            "h2",
            {
              style: {
                fontFamily: t.fontDisplay,
                fontSize: "clamp(40px, 4.4vw, 60px)",
                fontWeight: 700,
                margin: 0,
                letterSpacing: "0.005em",
                lineHeight: 1.05
              },
              children: r
            }
          ),
          /* @__PURE__ */ i(
            "div",
            {
              style: {
                marginTop: 16,
                width: 64,
                height: 3,
                background: t.accent,
                borderRadius: 999,
                transformOrigin: "left center",
                boxShadow: `0 0 12px ${t.accentGlow}`,
                ...o
              }
            }
          )
        ] }),
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 12,
              ...s
            },
            children: a
          }
        )
      ]
    }
  );
}, Or = ({ onClick: e, children: r }) => {
  const [a, n] = _(!1), o = H();
  return /* @__PURE__ */ i(
    "button",
    {
      onClick: e,
      onMouseEnter: () => n(!0),
      onMouseLeave: (s) => {
        n(!1), o.handlers.onPointerLeave(s);
      },
      onPointerDown: o.handlers.onPointerDown,
      style: {
        appearance: "none",
        background: a ? t.bgElevated : t.bgSurface,
        border: `1px solid ${a ? t.borderRegular : t.borderSubtle}`,
        borderRadius: t.radiusSm,
        height: 44,
        padding: "0 22px",
        color: t.textPrimary,
        fontFamily: t.fontUI,
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: "0.04em",
        cursor: "default",
        transform: o.pressed ? "scale(0.96)" : a ? "translateY(-1px)" : "translateY(0)",
        transition: `background ${t.durFast}ms ${t.easeOut}, border-color ${t.durFast}ms ${t.easeOut}, transform ${t.durFast}ms ${t.easeOut}`
      },
      children: r
    }
  );
}, re = ({ onClick: e }) => {
  const [r, a] = _(!1), n = H();
  return /* @__PURE__ */ i(
    "button",
    {
      onClick: e,
      onMouseEnter: () => a(!0),
      onMouseLeave: (o) => {
        a(!1), n.handlers.onPointerLeave(o);
      },
      onPointerDown: n.handlers.onPointerDown,
      "aria-label": "关闭",
      style: {
        appearance: "none",
        background: r ? t.bgElevated : t.bgSurface,
        border: `1px solid ${r ? t.borderRegular : t.borderSubtle}`,
        borderRadius: t.radiusSm,
        width: 44,
        height: 44,
        color: t.textPrimary,
        cursor: "default",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: n.pressed ? "scale(0.92) rotate(90deg)" : r ? "rotate(90deg)" : "rotate(0)",
        transition: `background ${t.durFast}ms ${t.easeOut}, border-color ${t.durFast}ms ${t.easeOut}, transform ${t.durFast}ms ${t.easeOut}`
      },
      children: /* @__PURE__ */ i("svg", { width: "16", height: "16", viewBox: "0 0 16 16", "aria-hidden": !0, children: /* @__PURE__ */ i(
        "path",
        {
          d: "M3 3l10 10M13 3L3 13",
          stroke: "currentColor",
          strokeWidth: "1.8",
          strokeLinecap: "round"
        }
      ) })
    }
  );
};
function Pr(e) {
  if (typeof e != "string" || !e.trim()) return [];
  let r;
  try {
    r = JSON.parse(e);
  } catch {
    return [];
  }
  if (!Array.isArray(r)) return [];
  const a = [];
  for (const n of r) {
    if (!n || typeof n != "object") continue;
    const o = n;
    typeof o.assetPath != "string" || !o.assetPath.trim() || a.push({
      assetPath: o.assetPath,
      distance: typeof o.distance == "number" ? o.distance : void 0,
      offset: typeof o.offset == "string" ? o.offset : void 0,
      name: typeof o.name == "string" ? o.name : void 0
    });
  }
  return a;
}
function ne(e) {
  if (!e || typeof e.entryId != "string" || !e.entryId || typeof e.sceneId != "string" || !e.sceneId || !Array.isArray(e.layers) || e.layers.length === 0) return !1;
  for (const r of e.layers)
    if (!r || typeof r.assetPath != "string" || !r.assetPath) return !1;
  return !0;
}
function me(e) {
  return !e || typeof e.entryId != "string" || !e.entryId.trim() || typeof e.title != "string" || !e.title.trim() ? !1 : typeof e.audioUri == "string" && e.audioUri.trim().length > 0;
}
function be(e) {
  return !e || typeof e.entryId != "string" || !e.entryId.trim() || typeof e.title != "string" || !e.title.trim() ? !1 : typeof e.fragmentId == "string" && e.fragmentId.trim().length > 0;
}
function B(e) {
  return typeof e != "string" ? void 0 : e.trim() || void 0;
}
function Lr(e) {
  const r = typeof e.customTitle == "string" ? e.customTitle.trim() : "", a = typeof e.sceneName == "string" ? e.sceneName.trim() : "";
  return r || a || e.sceneId;
}
function Tr(e) {
  for (const r of e)
    if (r && typeof r.assetPath == "string" && r.assetPath.trim())
      return r.assetPath;
  return "";
}
var zr = Object.defineProperty, Er = Object.getOwnPropertyDescriptor, Rr = (e, r, a) => r in e ? zr(e, r, { enumerable: !0, configurable: !0, writable: !0, value: a }) : e[r] = a, Br = (e, r, a, n) => {
  for (var o = n > 1 ? void 0 : n ? Er(r, a) : r, s = e.length - 1, l; s >= 0; s--)
    (l = e[s]) && (o = l(o) || o);
  return o;
}, Y = (e, r, a) => Rr(e, typeof r != "symbol" ? r + "" : r, a);
const Dr = "gallery-screen", Wr = `${At.id}.unlockedShared`, Ar = `${At.id}.unlockedSlot`;
function Hr(e) {
  const [r] = e.variables.useValue(Wr), [a] = e.variables.useValue(Ar), n = r ?? [], o = a ?? [], s = /* @__PURE__ */ new Set(), l = [];
  for (const c of [...n, ...o])
    ne(c) && (s.has(c.entryId) || (s.add(c.entryId), l.push(c)));
  return l;
}
const Vr = () => {
  const e = K(), r = Hr(e), { phase: a, requestClose: n } = ie(e, Dr), [o, s] = _(null);
  T(() => {
    if (o) return;
    const u = (p) => {
      p.key === "Escape" && n();
    }, g = (p) => {
      p.button === 1 && (p.preventDefault(), n());
    };
    return window.addEventListener("keydown", u), window.addEventListener("auxclick", g), () => {
      window.removeEventListener("keydown", u), window.removeEventListener("auxclick", g);
    };
  }, [o, n]);
  const l = (u) => {
    u.preventDefault(), !o && n();
  }, c = se(a), d = P({
    hidden: { opacity: 0, transform: "translateY(14px)" },
    delay: 180
  }), f = 12;
  return /* @__PURE__ */ x(
    "div",
    {
      onContextMenu: l,
      style: {
        position: "absolute",
        inset: 0,
        background: t.bgOverlayStrong,
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        color: t.textPrimary,
        fontFamily: t.fontUI,
        display: "flex",
        flexDirection: "column",
        willChange: "opacity",
        ...c
      },
      children: [
        /* @__PURE__ */ i(
          le,
          {
            eyebrow: "Gallery",
            title: "鉴赏室",
            phase: a,
            rightSlot: /* @__PURE__ */ x(te, { children: [
              /* @__PURE__ */ x(
                "span",
                {
                  style: {
                    fontFamily: t.fontMono,
                    fontSize: 14,
                    color: t.textMuted,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    marginRight: 4
                  },
                  children: [
                    r.length,
                    " 张"
                  ]
                }
              ),
              /* @__PURE__ */ i(re, { onClick: n })
            ] })
          }
        ),
        /* @__PURE__ */ i(
          "div",
          {
            className: "avg-shell-scrollbar",
            style: {
              flex: 1,
              overflowY: "auto",
              padding: "24px 80px 80px"
            },
            children: /* @__PURE__ */ i("div", { style: { maxWidth: 1160, margin: "0 auto" }, children: r.length === 0 ? /* @__PURE__ */ i(
              "div",
              {
                style: {
                  textAlign: "center",
                  marginTop: 100,
                  fontFamily: t.fontDisplay,
                  fontSize: 22,
                  color: t.textFaint,
                  fontWeight: 500,
                  ...d
                },
                children: "还没有解锁任何鉴赏内容"
              }
            ) : /* @__PURE__ */ i(
              "div",
              {
                style: {
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: 20
                },
                children: r.map((u, g) => /* @__PURE__ */ i(
                  Yr,
                  {
                    entry: u,
                    ctx: e,
                    animationDelay: 140 + Math.min(g, f) * 36,
                    onOpen: () => s(u)
                  },
                  u.entryId
                ))
              }
            ) })
          }
        ),
        o && /* @__PURE__ */ i(
          Gr,
          {
            entry: o,
            ctx: e,
            onClose: () => s(null)
          }
        )
      ]
    }
  );
}, Yr = ({ entry: e, ctx: r, animationDelay: a, onOpen: n }) => {
  const [o, s] = _(!1), l = H(), c = P({
    hidden: { opacity: 0, transform: "translateY(16px) scale(0.97)" },
    delay: a
  });
  return /* @__PURE__ */ i("div", { style: c, children: /* @__PURE__ */ x(
    "div",
    {
      onClick: n,
      onMouseEnter: () => s(!0),
      onMouseLeave: () => {
        s(!1), l.handlers.onPointerLeave();
      },
      onPointerDown: l.handlers.onPointerDown,
      role: "button",
      "aria-label": e.title,
      style: {
        position: "relative",
        aspectRatio: "16 / 9",
        borderRadius: t.radiusMd,
        overflow: "hidden",
        background: t.bgSunken,
        border: `1px solid ${o ? t.borderAccent : t.borderSubtle}`,
        cursor: "default",
        transform: l.pressed ? "scale(0.97)" : o ? "translateY(-2px)" : "translateY(0)",
        boxShadow: o ? `0 8px 28px rgba(0, 0, 0, 0.4), 0 0 16px ${t.accentGlow}` : "0 2px 10px rgba(0, 0, 0, 0.25)",
        transition: `border-color ${t.durFast}ms ${t.easeOut}, transform ${t.durFast}ms ${t.easeOut}, box-shadow ${t.durBase}ms ${t.easeOut}`
      },
      children: [
        /* @__PURE__ */ i(
          jr,
          {
            layers: e.layers,
            ctx: r,
            hover: o,
            alt: e.title
          }
        ),
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "26px 12px 10px",
              background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 100%)",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: o ? t.accent : t.textPrimary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              transition: `color ${t.durFast}ms ${t.easeOut}`
            },
            children: e.title
          }
        )
      ]
    }
  ) });
}, jr = ({ layers: e, ctx: r, hover: a, alt: n }) => /* @__PURE__ */ i(
  "div",
  {
    style: {
      position: "absolute",
      inset: 0,
      transform: a ? "scale(1.05)" : "scale(1)",
      transition: `transform ${t.durSlow}ms ${t.easeOut}`
    },
    children: e.map((o, s) => {
      const l = r.asset.resolve(o.assetPath).url;
      return /* @__PURE__ */ i(
        "img",
        {
          src: l,
          alt: s === 0 ? n : "",
          draggable: !1,
          style: {
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block"
          }
        },
        `${s}-${o.assetPath}`
      );
    })
  }
), Gr = ({ entry: e, ctx: r, onClose: a }) => {
  const n = P({
    hidden: { opacity: 0 },
    duration: t.durBase
  }), o = P({
    hidden: { opacity: 0, transform: "scale(0.96) translateY(10px)" },
    delay: 40
  }), s = j(null), [l, c] = _(null), [d, f] = _(!1), u = j(null), g = t.durBase, p = () => {
    d || (f(!0), u.current = window.setTimeout(() => {
      a();
    }, g));
  };
  return T(() => () => {
    u.current != null && clearTimeout(u.current);
  }, []), T(() => {
    const b = (w) => {
      w.key === "Escape" && p();
    }, y = (w) => {
      w.button === 1 && (w.preventDefault(), p());
    };
    return window.addEventListener("keydown", b), window.addEventListener("auxclick", y), () => {
      window.removeEventListener("keydown", b), window.removeEventListener("auxclick", y);
    };
  }, []), T(() => {
    if (!s.current) return;
    const b = s.current;
    let y = null, w = !1;
    return (async () => {
      try {
        const k = await r.sceneRender.mount(b, e.layers, {
          // 场景图按 AVG 常规呈现 = 铺满容器、超出裁掉(cover),
          // contain 会留黑边导致用户看到"显示不全"
          displayType: "cover"
        });
        if (w) {
          k.dispose();
          return;
        }
        y = k;
      } catch (k) {
        console.error("[gallery] 大图临时引擎渲染失败:", k), w || c(
          k instanceof Error ? k.message : "场景渲染失败"
        );
      }
    })(), () => {
      w = !0, y == null || y.dispose();
    };
  }, [r.sceneRender, e.layers]), /* @__PURE__ */ x(
    "div",
    {
      onClick: p,
      onContextMenu: (b) => {
        b.preventDefault(), b.stopPropagation(), p();
      },
      style: {
        position: "absolute",
        inset: 0,
        zIndex: 20,
        background: "rgba(0, 0, 0, 0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // 关闭态:整层 fade out,覆盖引擎 destroy 的中间态白闪
        ...d ? {
          opacity: 0,
          transition: `opacity ${g}ms ${t.easeOut}`,
          pointerEvents: "none"
        } : n
      },
      children: [
        /* @__PURE__ */ x(
          "div",
          {
            onClick: (b) => b.stopPropagation(),
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              maxWidth: "88%",
              ...d ? {
                // 关闭态:figure 一并下沉淡出,跟 enter 动画对称
                opacity: 0,
                transform: "scale(0.96) translateY(10px)",
                transition: `opacity ${g}ms ${t.easeOut}, transform ${g}ms ${t.easeOut}`
              } : o
            },
            children: [
              /* @__PURE__ */ i(
                "div",
                {
                  ref: s,
                  style: {
                    position: "relative",
                    width: "min(88vw, 1280px)",
                    aspectRatio: "16 / 9",
                    maxHeight: "72vh",
                    borderRadius: t.radiusLg,
                    border: `1px solid ${t.borderSubtle}`,
                    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6)",
                    background: "#000",
                    overflow: "hidden"
                  },
                  children: l && /* @__PURE__ */ x(
                    "div",
                    {
                      style: {
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: t.textMuted,
                        fontSize: 14,
                        padding: 24,
                        textAlign: "center"
                      },
                      children: [
                        "场景渲染失败:",
                        l
                      ]
                    }
                  )
                }
              ),
              /* @__PURE__ */ i(
                "div",
                {
                  style: {
                    marginTop: 20,
                    fontFamily: t.fontDisplay,
                    fontSize: 20,
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                    textAlign: "center"
                  },
                  children: e.title
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ i(
          "div",
          {
            onClick: (b) => b.stopPropagation(),
            style: { position: "absolute", top: 28, right: 32 },
            children: /* @__PURE__ */ i(re, { onClick: p })
          }
        )
      ]
    }
  );
};
let V = class extends J {
  render() {
    return { component: Vr, props: {} };
  }
};
Y(V, "saveSchema", jt({
  unlockedShared: {
    type: "list",
    persistence: "shared",
    default: []
  },
  unlockedSlot: {
    type: "list",
    persistence: "slot",
    default: []
  },
  unlockedMusicShared: {
    type: "list",
    persistence: "shared",
    default: []
  },
  unlockedMusicSlot: {
    type: "list",
    persistence: "slot",
    default: []
  },
  unlockedFragmentsShared: {
    type: "list",
    persistence: "shared",
    default: []
  },
  unlockedFragmentsSlot: {
    type: "list",
    persistence: "slot",
    default: []
  }
}));
Y(V, "settings", X((e) => ({
  unlockScope: e.enum("解锁记录范围", ["shared", "slot"]).labels({ shared: "全局共享(跨存档)", slot: "跟随存档" }).default("shared").describe(
    "新解锁的鉴赏条目记到哪里:全局共享 = 任意周目解锁全局可见;跟随存档 = 只在当前存档可见。已解锁条目不受切换影响。"
  )
})));
Y(V, "addToGallery", G({
  id: "add-to-gallery",
  title: "加入鉴赏",
  description: "把一个场景解锁到鉴赏室,玩家可在鉴赏界面查看",
  schema: {
    // scene 字段值是 sceneId 字符串;Inspector 选场景时同步把 layers 快照
    // 写进兄弟字段 _sceneLayers、场景名写进 _sceneName(都是内部兄弟字段)。
    scene: { type: "scene", label: "鉴赏场景", required: !0 },
    // 选填:不填时缺省用场景名称(而非 sceneId)。
    title: { type: "string", label: "标题(选填,默认用场景名)" }
  },
  run(e, r) {
    const a = typeof r.scene == "string" ? r.scene.trim() : "";
    if (!a) {
      console.warn("[gallery] 「加入鉴赏」缺少场景,已跳过:", r);
      return;
    }
    const n = a, o = this.save, s = e.settings.get("unlockScope") ?? "shared", l = o.get("unlockedShared") ?? [], c = o.get("unlockedSlot") ?? [];
    if ([...l, ...c].some((y) => (y == null ? void 0 : y.entryId) === n)) return;
    const f = r._sceneLayers, u = Pr(
      typeof f == "string" ? f : void 0
    );
    if (u.length === 0) {
      console.warn(
        "[gallery] 「加入鉴赏」layers 快照缺失或为空,已跳过:",
        { sceneId: a }
      );
      return;
    }
    const g = r, p = Lr({
      customTitle: g.title,
      sceneName: g._sceneName,
      sceneId: a
    }), b = {
      entryId: n,
      title: p,
      sceneId: a,
      layers: u,
      // 拍平一张顶层封面,供可视化「数据列表」版鉴赏墙绑图(它取不到嵌套 layers)
      coverImage: Tr(u)
    };
    s === "slot" ? o.set("unlockedSlot", [...c.filter(ne), b]) : o.set("unlockedShared", [...l.filter(ne), b]);
  }
}));
Y(V, "removeFromGallery", G({
  id: "remove-from-gallery",
  title: "移除鉴赏",
  description: "从鉴赏室移除指定场景对应的条目(两个记录桶都会找)",
  schema: {
    scene: { type: "scene", label: "鉴赏场景", required: !0 }
  },
  run(e, r) {
    const a = typeof r.scene == "string" ? r.scene.trim() : "";
    if (!a) {
      console.warn("[gallery] 「移除鉴赏」缺少场景,已跳过");
      return;
    }
    const n = this.save, o = (s) => ne(s) && s.sceneId !== a;
    n.set(
      "unlockedShared",
      (n.get("unlockedShared") ?? []).filter(o)
    ), n.set(
      "unlockedSlot",
      (n.get("unlockedSlot") ?? []).filter(o)
    );
  }
}));
Y(V, "addMusicToGallery", G({
  id: "add-music-to-gallery",
  title: "加入音乐鉴赏",
  description: "解锁一首音乐，玩家可在鉴赏界面试听",
  schema: {
    audio: {
      type: "asset",
      assetType: "audio",
      label: "音乐资源",
      required: !0
    },
    title: { type: "string", label: "曲名（选填）" },
    artist: { type: "string", label: "作者（选填）" },
    description: {
      type: "string",
      label: "曲目说明（选填）",
      multiline: !0
    }
  },
  run(e, r) {
    var f;
    const a = B(r.audio);
    if (!a) {
      console.warn("[gallery] 「加入音乐鉴赏」缺少音乐资源，已跳过");
      return;
    }
    const n = B(r.title) ?? ((f = a.split(/[\\/]/).pop()) == null ? void 0 : f.replace(/\.[^.]+$/, "")) ?? a, o = {
      entryId: a,
      title: n,
      audioUri: a,
      artist: B(r.artist),
      description: B(r.description)
    }, s = this.save, l = s.get("unlockedMusicShared") ?? [], c = s.get("unlockedMusicSlot") ?? [];
    if ([...l, ...c].some((u) => (u == null ? void 0 : u.entryId) === o.entryId))
      return;
    (e.settings.get("unlockScope") ?? "shared") === "slot" ? s.set("unlockedMusicSlot", [
      ...c.filter(me),
      o
    ]) : s.set("unlockedMusicShared", [
      ...l.filter(me),
      o
    ]);
  }
}));
Y(V, "removeMusicFromGallery", G({
  id: "remove-music-from-gallery",
  title: "移除音乐鉴赏",
  description: "从音乐鉴赏中移除指定音乐（全局与当前存档都会移除）",
  schema: {
    audio: {
      type: "asset",
      assetType: "audio",
      label: "音乐资源",
      required: !0
    }
  },
  run(e, r) {
    const a = B(r.audio);
    if (!a) return;
    const n = this.save, o = (s) => me(s) && s.audioUri !== a;
    n.set(
      "unlockedMusicShared",
      (n.get("unlockedMusicShared") ?? []).filter(o)
    ), n.set(
      "unlockedMusicSlot",
      (n.get("unlockedMusicSlot") ?? []).filter(o)
    );
  }
}));
Y(V, "addFragmentToGallery", G({
  id: "add-fragment-to-gallery",
  title: "加入片段鉴赏",
  description: "解锁一个剧情片段，玩家可在鉴赏界面重新播放",
  schema: {
    fragment: {
      type: "fragment",
      label: "剧情片段",
      required: !0,
      chapterField: "chapterId"
    },
    chapterId: { type: "string", label: "章节 ID（跨章节时填写）" },
    title: { type: "string", label: "标题（选填，默认用片段名）" },
    description: {
      type: "string",
      label: "片段说明（选填）",
      multiline: !0
    },
    cover: {
      type: "asset",
      assetType: "image",
      label: "封面图（选填）"
    }
  },
  async run(e, r) {
    const a = B(r.fragment);
    if (!a) {
      console.warn("[gallery] 「加入片段鉴赏」缺少剧情片段，已跳过");
      return;
    }
    let n = B(r.chapterId);
    const o = B(r.title);
    let s, l;
    const c = () => l ?? (l = e.story.getAllChapters());
    try {
      if (n && o)
        s = void 0;
      else {
        let S = n && typeof e.story.getChapter == "function" ? await e.story.getChapter(n) : null;
        if (!S) {
          const h = await c();
          S = n ? h.find((I) => I.id === n) : h.find(
            (I) => I.fragments.some((O) => O.id === a)
          );
        }
        const F = S == null ? void 0 : S.fragments.find(
          (h) => h.id === a
        );
        n = (S == null ? void 0 : S.id) ?? n, s = B(F == null ? void 0 : F.name);
      }
    } catch (S) {
      console.warn("[gallery] 读取片段标题失败，将使用片段 ID", S);
    }
    const d = {
      entryId: `${n ?? "current"}:${a}`,
      title: o ?? s ?? a,
      fragmentId: a,
      chapterId: n,
      description: B(r.description),
      coverImage: B(r.cover)
    }, f = this.save, u = f.get("unlockedFragmentsShared") ?? [], g = f.get("unlockedFragmentsSlot") ?? [], p = `current:${d.fragmentId}`, b = [...u, ...g].some(
      (S) => (S == null ? void 0 : S.entryId) === p && S.fragmentId === d.fragmentId && !S.chapterId
    );
    let y = !1;
    if (d.chapterId && b)
      try {
        const S = (await c()).filter(
          (F) => F.fragments.some(
            (h) => h.id === d.fragmentId
          )
        );
        y = S.length === 1 && S[0].id === d.chapterId;
      } catch (S) {
        console.warn(
          "[gallery] 无法确认历史 current 条目所属章节，将保留原记录",
          S
        );
      }
    const w = Object.prototype.hasOwnProperty.call(r, "title") && r.title !== void 0, k = Object.prototype.hasOwnProperty.call(r, "description") && r.description !== void 0, E = Object.prototype.hasOwnProperty.call(r, "cover") && r.cover !== void 0, C = (S) => {
      const F = [];
      let h = -1;
      if (S.forEach((v, m) => {
        if ((v == null ? void 0 : v.entryId) === d.entryId) {
          h = h < 0 ? m : h, F.push(m);
          return;
        }
        y && (v == null ? void 0 : v.entryId) === p && v.fragmentId === d.fragmentId && !v.chapterId && F.push(m);
      }), F.length === 0)
        return { entries: S, matched: !1, changed: !1 };
      const I = h >= 0 ? h : F[0];
      let O = {};
      for (const v of F)
        v !== I && (O = { ...O, ...S[v] });
      const R = S[I];
      O = { ...O, ...R };
      const W = {
        ...O,
        entryId: d.entryId,
        title: w ? d.title : O.title,
        fragmentId: d.fragmentId,
        chapterId: d.chapterId,
        description: k ? d.description : O.description,
        coverImage: E ? d.coverImage : O.coverImage
      };
      if (!(F.length > 1 || W.entryId !== R.entryId || W.title !== R.title || W.fragmentId !== R.fragmentId || W.chapterId !== R.chapterId || W.description !== R.description || W.coverImage !== R.coverImage || Object.keys(W).length !== Object.keys(R).length))
        return { entries: S, matched: !0, changed: !1 };
      const Z = new Set(F), N = [];
      return S.forEach((v, m) => {
        m === I ? N.push(W) : Z.has(m) || N.push(v);
      }), { entries: N, matched: !0, changed: !0 };
    }, z = C(u), M = C(g);
    if (z.changed && f.set("unlockedFragmentsShared", z.entries), M.changed && f.set("unlockedFragmentsSlot", M.entries), z.matched || M.matched)
      return;
    (e.settings.get("unlockScope") ?? "shared") === "slot" ? f.set("unlockedFragmentsSlot", [
      ...g.filter(be),
      d
    ]) : f.set("unlockedFragmentsShared", [
      ...u.filter(be),
      d
    ]);
  }
}));
Y(V, "removeFragmentFromGallery", G({
  id: "remove-fragment-from-gallery",
  title: "移除片段鉴赏",
  description: "从片段鉴赏中移除指定剧情片段（全局与当前存档都会移除）",
  schema: {
    fragment: {
      type: "fragment",
      label: "剧情片段",
      required: !0,
      chapterField: "chapterId"
    },
    chapterId: { type: "string", label: "章节 ID（选填）" }
  },
  run(e, r) {
    const a = B(r.fragment), n = B(r.chapterId);
    if (!a) return;
    const o = this.save, s = (l) => be(l) && (l.fragmentId !== a || n !== void 0 && l.chapterId !== n);
    o.set(
      "unlockedFragmentsShared",
      (o.get("unlockedFragmentsShared") ?? []).filter(s)
    ), o.set(
      "unlockedFragmentsSlot",
      (o.get("unlockedFragmentsSlot") ?? []).filter(s)
    );
  }
}));
Y(V, "clearGallery", G({
  id: "clear-gallery",
  title: "清空鉴赏",
  description: "清空 CG、音乐与片段鉴赏的全部解锁记录（慎用）",
  run() {
    const e = this.save;
    e.set("unlockedShared", []), e.set("unlockedSlot", []), e.set("unlockedMusicShared", []), e.set("unlockedMusicSlot", []), e.set("unlockedFragmentsShared", []), e.set("unlockedFragmentsSlot", []);
  }
}));
V = Br([
  q({
    id: "gallery-screen",
    label: "鉴赏管理",
    exposeUI: !1,
    // 保留鉴赏方法和存档数据,React 版不再进入 UI 列表
    /** 声明本 UI 实现"鉴赏"槽位,Studio 系统槽位面板据此列为候选。 */
    supportsSlot: L.Gallery
  })
], V);
const Me = "avg-default-shell-toast-container", Nr = 2400, ce = 220;
function pe(e) {
  const r = document.getElementById("game-view");
  if (!r) {
    e.style.left = "50%", e.style.bottom = "32px", e.style.top = "auto", e.style.right = "auto", e.style.width = "auto";
    return;
  }
  const a = r.getBoundingClientRect();
  e.style.left = `${a.left}px`, e.style.top = `${a.bottom - 32 - 64}px`, e.style.width = `${a.width}px`, e.style.bottom = "auto", e.style.right = "auto";
}
function Ur() {
  if (typeof document > "u") return null;
  let e = document.getElementById(Me);
  if (e)
    return pe(e), e;
  e = document.createElement("div"), e.id = Me, e.style.cssText = [
    "position: fixed",
    // 跟引擎 engine-mask 同款 max int 层级,确保压在 SaveScreen overlay 之上。
    // SaveScreen 自己用 position:absolute 没设 z-index,但被引擎 UISystem
    // 装进 topmost 容器后实际有高层级,普通 99999 可能被盖。
    "z-index: 2147483647",
    "display: flex",
    "flex-direction: column",
    "align-items: center",
    "justify-content: flex-end",
    "gap: 8px",
    "pointer-events: none"
  ].join(";"), document.body.appendChild(e), pe(e);
  const r = document.getElementById("game-view");
  return r && typeof ResizeObserver < "u" && new ResizeObserver(() => pe(e)).observe(r), e;
}
const Xr = {
  info: "·",
  success: "✓",
  warn: "!",
  error: "×"
}, qr = {
  info: t.textMuted,
  success: t.accent,
  warn: t.accent,
  error: t.danger
};
function A(e, r = {}) {
  const a = Ur();
  if (!a) return;
  const n = r.type ?? "info", o = r.durationMs ?? Nr, s = document.createElement("div");
  s.style.cssText = [
    `font-family: ${t.fontUI}`,
    "font-size: 13px",
    "font-weight: 500",
    "letter-spacing: 0.04em",
    `color: ${t.textPrimary}`,
    "background: rgba(11, 13, 16, 0.88)",
    `border: 1px solid ${t.borderRegular}`,
    "border-radius: 8px",
    "padding: 10px 16px",
    "backdrop-filter: blur(12px)",
    "-webkit-backdrop-filter: blur(12px)",
    "box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4)",
    "display: flex",
    "align-items: center",
    "gap: 10px",
    "opacity: 0",
    "transform: translateY(8px)",
    `transition: opacity ${ce}ms ${t.easeOut}, transform ${ce}ms ${t.easeOut}`,
    "max-width: 480px",
    "pointer-events: none"
  ].join(";");
  const l = document.createElement("span");
  l.textContent = Xr[n], l.style.cssText = [
    `color: ${qr[n]}`,
    "font-weight: 700",
    "font-size: 14px",
    "line-height: 1",
    "flex-shrink: 0"
  ].join(";"), s.appendChild(l);
  const c = document.createElement("span");
  c.textContent = e, s.appendChild(c), a.appendChild(s), s.offsetHeight, s.style.opacity = "1", s.style.transform = "translateY(0)", setTimeout(() => {
    s.style.opacity = "0", s.style.transform = "translateY(8px)", setTimeout(() => {
      s.remove(), a.childElementCount === 0 && a.remove();
    }, ce);
  }, o);
}
var Jr = Object.defineProperty, Kr = Object.getOwnPropertyDescriptor, Qr = (e, r, a) => r in e ? Jr(e, r, { enumerable: !0, configurable: !0, writable: !0, value: a }) : e[r] = a, Zr = (e, r, a, n) => {
  for (var o = n > 1 ? void 0 : n ? Kr(r, a) : r, s = e.length - 1, l; s >= 0; s--)
    (l = e[s]) && (o = l(o) || o);
  return o;
}, ea = (e, r, a) => Qr(e, r + "", a);
const ue = 6, ke = "@avg.internal.default-shell/save-screen", ta = ({ mode: e = "save", source: r = "game" }) => {
  const a = K(), n = a.archive.useSlots(), o = a.settings.get("slotCount") ?? 30, s = a.settings.get("allowDelete") ?? !0, { phase: l, requestClose: c } = ie(a, "save-screen"), [d, f] = _(null), [u, g] = _(0), [p, b] = _("right"), [y, w] = _(!1), k = j(!1), E = j(!0);
  T(() => (E.current = !0, () => {
    E.current = !1;
  }), []);
  const C = Math.max(1, Math.ceil(o / ue)), z = Oe(() => {
    const m = u * ue, $ = [];
    for (let ee = 0; ee < ue; ee++) {
      const de = m + ee + 1;
      if (de > o) break;
      const Vt = n.find((Yt) => Yt.id === de) ?? null;
      $.push({ id: de, slot: Vt });
    }
    return $;
  }, [u, n, o]);
  T(() => {
    const m = ($) => {
      if ($.key === "Escape") {
        d ? f(null) : c();
        return;
      }
      d || ($.key === "ArrowLeft" && M(), $.key === "ArrowRight" && D());
    };
    return window.addEventListener("keydown", m), () => window.removeEventListener("keydown", m);
  }, [u, C, d]);
  const M = () => {
    u > 0 && (b("left"), g((m) => m - 1));
  }, D = () => {
    u < C - 1 && (b("right"), g((m) => m + 1));
  }, S = (m) => {
    k.current || (k.current = !0, w(!0), a.archive.save(m).then(($) => {
      $ && A(`已保存到 #${String(m).padStart(2, "0")}`, { type: "success" });
    }).catch(($) => {
      console.error("[save-screen] save failed", $), A("保存失败", { type: "error" });
    }).finally(() => {
      k.current = !1, E.current && w(!1);
    }));
  }, F = (m) => {
    a.archive.load(m), c();
  }, h = (m) => {
    a.archive.delete(m).then(() => A(`已删除 #${String(m).padStart(2, "0")}`, { type: "info" })).catch(($) => {
      console.error("[save-screen] delete failed", $), A("删除失败", { type: "error" });
    });
  }, I = (m, $) => S(m), O = (m) => {
    if (r === "title") {
      F(m);
      return;
    }
    f({ slotId: m, action: "load" });
  }, R = (m) => {
    f({ slotId: m, action: "delete" });
  }, W = () => {
    if (!d) return;
    const { slotId: m, action: $ } = d;
    f(null), $ === "load" ? F(m) : $ === "delete" && h(m);
  }, Q = () => f(null), Z = se(l), N = P({
    hidden: { opacity: 0, transform: "translateY(14px)" },
    delay: 280
  });
  return /* @__PURE__ */ x(
    "div",
    {
      onContextMenu: (m) => {
        m.preventDefault(), d ? f(null) : c();
      },
      style: {
        position: "absolute",
        inset: 0,
        background: t.bgOverlay,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        color: t.textPrimary,
        fontFamily: t.fontUI,
        display: "flex",
        flexDirection: "column",
        willChange: "opacity",
        ...Z
      },
      children: [
        /* @__PURE__ */ i(
          le,
          {
            eyebrow: e === "load" ? "Load" : "Save",
            title: e === "load" ? "读取存档" : "保存存档",
            phase: l,
            rightSlot: /* @__PURE__ */ x(te, { children: [
              /* @__PURE__ */ x(
                "span",
                {
                  style: {
                    fontFamily: t.fontMono,
                    fontSize: 14,
                    color: t.textMuted,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    marginRight: 4
                  },
                  children: [
                    String(u + 1).padStart(2, "0"),
                    " /",
                    " ",
                    String(C).padStart(2, "0")
                  ]
                }
              ),
              /* @__PURE__ */ i(re, { onClick: c })
            ] })
          }
        ),
        /* @__PURE__ */ x(
          "div",
          {
            style: {
              flex: 1,
              display: "grid",
              gridTemplateColumns: "88px 1fr 88px",
              gap: 16,
              padding: "0 56px 24px",
              minHeight: 0,
              alignItems: "center"
            },
            children: [
              /* @__PURE__ */ i(
                _e,
                {
                  dir: "left",
                  disabled: u === 0,
                  onClick: M,
                  delay: 160,
                  phase: l
                }
              ),
              /* @__PURE__ */ i(
                "div",
                {
                  "aria-busy": y || void 0,
                  style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gridTemplateRows: "repeat(2, 1fr)",
                    gap: 24,
                    height: "100%",
                    animation: `${p === "right" ? "avg-page-slide-in-right" : "avg-page-slide-in-left"} ${t.durBase}ms ${t.easeOut}`
                  },
                  children: z.map(({ id: m, slot: $ }, ee) => /* @__PURE__ */ i(
                    aa,
                    {
                      id: m,
                      slot: $,
                      snapshotUrl: ($ == null ? void 0 : $.snapshotDataUri) ?? null,
                      allowDelete: s,
                      mode: e,
                      busy: y,
                      onSave: () => I(m),
                      onLoad: () => O(m),
                      onDelete: () => R(m),
                      animationDelay: 120 + ee * 40,
                      phase: l
                    },
                    m
                  ))
                },
                u
              ),
              /* @__PURE__ */ i(
                _e,
                {
                  dir: "right",
                  disabled: u >= C - 1,
                  onClick: D,
                  delay: 160,
                  phase: l
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ i(
          "footer",
          {
            style: {
              padding: "16px 0 40px",
              display: "flex",
              justifyContent: "center",
              gap: 10,
              ...N
            },
            children: Array.from({ length: C }).map((m, $) => /* @__PURE__ */ i(
              ra,
              {
                active: $ === u,
                onClick: () => {
                  b($ > u ? "right" : "left"), g($);
                },
                label: `第 ${$ + 1} 页`
              },
              $
            ))
          }
        ),
        d && /* @__PURE__ */ i(
          oa,
          {
            action: d.action,
            slotId: d.slotId,
            onConfirm: W,
            onCancel: Q
          }
        )
      ]
    }
  );
}, ra = ({ active: e, onClick: r, label: a }) => {
  const n = H();
  return /* @__PURE__ */ i(
    "button",
    {
      ...n.handlers,
      onClick: r,
      "aria-label": a,
      style: {
        appearance: "none",
        width: e ? 32 : 8,
        height: 8,
        borderRadius: 999,
        border: "none",
        padding: 0,
        background: e ? t.accent : t.borderRegular,
        cursor: "default",
        boxShadow: e ? `0 0 12px ${t.accentGlow}` : "none",
        transform: n.pressed ? "scale(0.85)" : "scale(1)",
        transition: `width ${t.durBase}ms ${t.easeOut}, background ${t.durBase}ms ${t.easeOut}, transform ${t.durFast}ms ${t.easeOut}, box-shadow ${t.durBase}ms ${t.easeOut}`
      }
    }
  );
}, aa = ({
  id: e,
  slot: r,
  snapshotUrl: a,
  allowDelete: n,
  mode: o,
  busy: s,
  onSave: l,
  onLoad: c,
  onDelete: d,
  animationDelay: f,
  phase: u
}) => {
  const [g, p] = _(!1), [b, y] = _(!1), w = H(), k = r === null, E = o === "load" && k, C = !E && !s, z = String(e).padStart(2, "0"), M = k ? o === "save" ? `保存到空槽位 #${z}` : `空槽位 #${z}` : o === "save" ? `覆盖存档 #${z}` : `读取存档 #${z}`, D = () => {
    C && (o === "save" ? l() : c());
  }, S = Oe(() => {
    const h = e * 37 % 360;
    return `linear-gradient(135deg,
      hsl(${h}, 12%, 22%) 0%,
      hsl(${(h + 50) % 360}, 10%, 16%) 100%)`;
  }, [e]), F = P({
    hidden: {
      opacity: 0,
      transform: "translateY(18px) scale(0.97)"
    },
    delay: f,
    duration: t.durSlow
  });
  return /* @__PURE__ */ i(
    "div",
    {
      style: { display: "flex", ...F },
      children: /* @__PURE__ */ x(
        "article",
        {
          onMouseEnter: () => {
            C && p(!0);
          },
          onMouseLeave: (h) => {
            p(!1), y(!1), w.handlers.onPointerLeave(h);
          },
          onPointerDown: (h) => {
            C && w.handlers.onPointerDown(h);
          },
          style: {
            flex: 1,
            position: "relative",
            background: t.bgSurface,
            border: `1.5px solid ${g && C ? t.borderAccent : t.borderSubtle}`,
            borderRadius: t.radiusLg,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            transform: w.pressed ? "translateY(-2px) scale(0.98)" : g && C ? "translateY(-6px) scale(1.01)" : "translateY(0) scale(1)",
            boxShadow: g && C ? "0 28px 56px rgba(0,0,0,0.55), 0 0 0 1px rgba(212,165,116,0.22), 0 0 32px rgba(212,165,116,0.10)" : "0 4px 16px rgba(0,0,0,0.25)",
            transition: `transform ${t.durFast}ms ${t.easeOut}, border-color ${t.durFast}ms ${t.easeOut}, box-shadow ${t.durBase}ms ${t.easeOut}`,
            cursor: C ? "default" : "not-allowed",
            // load 模式空槽位:整张卡灰化 + 不响应
            opacity: E ? 0.45 : 1
          },
          children: [
            /* @__PURE__ */ i(
              "button",
              {
                type: "button",
                "aria-label": M,
                disabled: !C,
                onClick: D,
                style: {
                  position: "absolute",
                  inset: 0,
                  zIndex: 1,
                  appearance: "none",
                  border: "none",
                  padding: 0,
                  background: "transparent",
                  color: "transparent",
                  cursor: C ? "default" : "not-allowed"
                }
              }
            ),
            /* @__PURE__ */ x(
              "div",
              {
                style: {
                  position: "relative",
                  flex: "1 1 0",
                  minHeight: 0,
                  background: S,
                  overflow: "hidden"
                },
                children: [
                  a && /* @__PURE__ */ i(
                    "img",
                    {
                      src: a,
                      alt: "",
                      decoding: "async",
                      loading: "lazy",
                      draggable: !1,
                      style: {
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        pointerEvents: "none",
                        userSelect: "none"
                      }
                    }
                  ),
                  /* @__PURE__ */ x(
                    "div",
                    {
                      style: {
                        position: "absolute",
                        top: 14,
                        left: 16,
                        fontFamily: t.fontMono,
                        fontSize: 13,
                        letterSpacing: "0.24em",
                        color: t.textPrimary,
                        textShadow: "0 1px 6px rgba(0,0,0,0.9)",
                        background: "rgba(0,0,0,0.45)",
                        padding: "5px 11px",
                        borderRadius: 6,
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        fontWeight: 600
                      },
                      children: [
                        "#",
                        String(e).padStart(2, "0")
                      ]
                    }
                  ),
                  (r == null ? void 0 : r.isQuickSave) && /* @__PURE__ */ i(
                    "div",
                    {
                      style: {
                        position: "absolute",
                        top: 14,
                        right: 16,
                        fontFamily: t.fontMono,
                        fontSize: 11,
                        letterSpacing: "0.24em",
                        color: t.accent,
                        background: "rgba(0,0,0,0.45)",
                        padding: "5px 11px",
                        borderRadius: 6,
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        fontWeight: 700
                      },
                      children: "QUICK"
                    }
                  ),
                  !k && n && !s && /* @__PURE__ */ i(
                    "button",
                    {
                      type: "button",
                      "aria-label": `删除存档 #${z}`,
                      "aria-hidden": !g,
                      tabIndex: g ? 0 : -1,
                      onClick: (h) => {
                        h.stopPropagation(), d();
                      },
                      onPointerDown: (h) => h.stopPropagation(),
                      onMouseEnter: (h) => {
                        h.stopPropagation(), y(!0);
                      },
                      onMouseLeave: (h) => {
                        h.stopPropagation(), y(!1);
                      },
                      onFocus: () => {
                        p(!0), y(!0);
                      },
                      onBlur: () => {
                        p(!1), y(!1);
                      },
                      style: {
                        position: "absolute",
                        top: 14,
                        right: r != null && r.isQuickSave ? 98 : 16,
                        zIndex: 3,
                        width: 42,
                        height: 42,
                        borderRadius: "50%",
                        border: `1.5px solid ${b ? "rgba(255,154,146,0.96)" : "rgba(255,126,116,0.82)"}`,
                        background: b ? "rgba(255,232,230,0.96)" : "rgba(255,246,245,0.88)",
                        color: t.danger,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: g ? 1 : 0,
                        visibility: g ? "visible" : "hidden",
                        transform: g ? `translateY(0) scale(${b ? 1.1 : 1}) rotate(${b ? 4 : 0}deg)` : "translateY(-4px) scale(0.92) rotate(0deg)",
                        pointerEvents: g ? "auto" : "none",
                        boxShadow: b ? "0 16px 34px rgba(0,0,0,0.38), 0 0 0 2px rgba(224,99,90,0.22), 0 0 30px rgba(224,99,90,0.38)" : "0 12px 26px rgba(0,0,0,0.30), 0 0 0 2px rgba(255,255,255,0.30), 0 0 22px rgba(224,99,90,0.22)",
                        backdropFilter: "blur(10px)",
                        WebkitBackdropFilter: "blur(10px)",
                        transition: `opacity ${t.durFast}ms ${t.easeOut}, visibility ${t.durFast}ms ${t.easeOut}, transform ${t.durFast}ms ${t.easeOut}, background ${t.durFast}ms ${t.easeOut}, box-shadow ${t.durFast}ms ${t.easeOut}`,
                        cursor: "default"
                      },
                      children: /* @__PURE__ */ x("svg", { width: "20", height: "20", viewBox: "0 0 20 20", "aria-hidden": "true", children: [
                        /* @__PURE__ */ i(
                          "path",
                          {
                            d: "M5 5l10 10M15 5 5 15",
                            fill: "none",
                            stroke: "rgba(255,255,255,0.98)",
                            strokeWidth: "4.8",
                            strokeLinecap: "round",
                            strokeLinejoin: "round"
                          }
                        ),
                        /* @__PURE__ */ i(
                          "path",
                          {
                            d: "M5 5l10 10M15 5 5 15",
                            fill: "none",
                            stroke: "currentColor",
                            strokeWidth: "2.6",
                            strokeLinecap: "round",
                            strokeLinejoin: "round"
                          }
                        )
                      ] })
                    }
                  ),
                  k && /* @__PURE__ */ i(
                    "div",
                    {
                      style: {
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: t.textFaint,
                        fontFamily: t.fontDisplay,
                        fontSize: 24,
                        fontWeight: 500,
                        letterSpacing: "0.08em"
                      },
                      children: "EMPTY"
                    }
                  )
                ]
              }
            ),
            /* @__PURE__ */ i(
              "div",
              {
                style: {
                  padding: "14px 18px 16px",
                  background: t.bgSunken,
                  borderTop: `1px solid ${t.borderSubtle}`,
                  minHeight: 72
                },
                children: r ? /* @__PURE__ */ x(te, { children: [
                  r.currentSpeaker && /* @__PURE__ */ i(
                    "div",
                    {
                      style: {
                        fontFamily: t.fontUI,
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        color: t.accent,
                        marginBottom: 6
                      },
                      children: r.currentSpeaker
                    }
                  ),
                  /* @__PURE__ */ i(
                    "div",
                    {
                      style: {
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: t.textPrimary,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        textWrap: "pretty",
                        fontWeight: 400
                      },
                      children: r.currentDialogueText || "—"
                    }
                  ),
                  /* @__PURE__ */ i(
                    "div",
                    {
                      style: {
                        marginTop: 8,
                        fontFamily: t.fontMono,
                        fontSize: 11,
                        letterSpacing: "0.06em",
                        color: t.textFaint,
                        fontWeight: 500
                      },
                      children: sa(r.modifiedTime)
                    }
                  )
                ] }) : /* @__PURE__ */ i(
                  "div",
                  {
                    style: {
                      fontFamily: t.fontMono,
                      fontSize: 12,
                      letterSpacing: "0.20em",
                      color: t.textFaint,
                      textTransform: "uppercase",
                      fontWeight: 600
                    },
                    children: "no data"
                  }
                )
              }
            )
          ]
        }
      )
    }
  );
}, $e = ({ onClick: e, children: r, primary: a, danger: n }) => {
  const [o, s] = _(!1), l = H(), c = a ? o ? t.accent : "rgba(212,165,116,0.92)" : n ? o ? t.danger : t.dangerSoft : o ? t.bgElevated : "rgba(255,255,255,0.10)", d = a ? t.textOnAccent : n ? o ? "#fff" : t.danger : t.textPrimary;
  return /* @__PURE__ */ i(
    "button",
    {
      onClick: (f) => {
        f.stopPropagation(), e();
      },
      onMouseEnter: () => s(!0),
      onMouseLeave: (f) => {
        s(!1), l.handlers.onPointerLeave(f);
      },
      onPointerDown: l.handlers.onPointerDown,
      style: {
        appearance: "none",
        border: `1px solid ${a ? "transparent" : n ? "rgba(224,99,90,0.45)" : t.borderRegular}`,
        background: c,
        color: d,
        fontFamily: t.fontUI,
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "0.06em",
        padding: "10px 18px",
        borderRadius: t.radiusSm,
        cursor: "default",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: a && o ? `0 6px 20px ${t.accentGlow}` : "0 2px 8px rgba(0,0,0,0.3)",
        transform: l.pressed ? "scale(0.94)" : o ? "translateY(-2px) scale(1.04)" : "scale(1)",
        transition: `background ${t.durFast}ms ${t.easeOut}, color ${t.durFast}ms ${t.easeOut}, transform ${t.durFast}ms ${t.easeOut}, box-shadow ${t.durBase}ms ${t.easeOut}`
      },
      children: r
    }
  );
}, oa = ({ action: e, slotId: r, onConfirm: a, onCancel: n }) => {
  const o = P({
    hidden: { opacity: 0, transform: "scale(0.96)" },
    duration: t.durFast
  }), s = na[e];
  return /* @__PURE__ */ i(
    "div",
    {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": s.title,
      onClick: n,
      style: {
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.42)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 20
      },
      children: /* @__PURE__ */ x(
        "div",
        {
          onClick: (l) => l.stopPropagation(),
          style: {
            width: 360,
            maxWidth: "calc(100% - 48px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            padding: "26px 28px 24px",
            background: "rgba(18,20,24,0.92)",
            border: `1px solid ${s.danger ? "rgba(224,99,90,0.52)" : t.borderAccent}`,
            borderRadius: t.radiusLg,
            boxShadow: s.danger ? "0 28px 72px rgba(0,0,0,0.62), 0 0 36px rgba(224,99,90,0.16)" : `0 28px 72px rgba(0,0,0,0.62), 0 0 36px ${t.accentGlow}`,
            ...o
          },
          children: [
            /* @__PURE__ */ x(
              "div",
              {
                style: {
                  fontFamily: t.fontMono,
                  fontSize: 12,
                  letterSpacing: "0.20em",
                  color: s.danger ? t.danger : t.accent,
                  textTransform: "uppercase",
                  fontWeight: 700
                },
                children: [
                  "#",
                  String(r).padStart(2, "0")
                ]
              }
            ),
            /* @__PURE__ */ i(
              "div",
              {
                style: {
                  fontFamily: t.fontDisplay,
                  fontSize: 22,
                  fontWeight: 600,
                  color: t.textPrimary,
                  textAlign: "center"
                },
                children: s.title
              }
            ),
            /* @__PURE__ */ i(
              "div",
              {
                style: {
                  fontFamily: t.fontUI,
                  fontSize: 14,
                  fontWeight: 500,
                  color: t.textSecondary,
                  textAlign: "center",
                  lineHeight: 1.6
                },
                children: s.message
              }
            ),
            /* @__PURE__ */ x("div", { style: { display: "flex", gap: 10, marginTop: 2 }, children: [
              /* @__PURE__ */ i($e, { onClick: a, primary: !s.danger, danger: s.danger, children: s.confirmLabel }),
              /* @__PURE__ */ i($e, { onClick: n, children: "取消" })
            ] })
          ]
        }
      )
    }
  );
}, na = {
  load: { title: "确认读取存档", message: "读取此存档？未保存的内容会丢失。", confirmLabel: "读取" },
  delete: { title: "确认删除存档", message: "删除此存档？此操作不可撤销。", confirmLabel: "删除", danger: !0 }
}, _e = ({ dir: e, disabled: r, onClick: a, delay: n }) => {
  const [o, s] = _(!1), l = H(), c = P({
    hidden: { opacity: 0, transform: "translateY(14px)" },
    delay: n
  });
  return /* @__PURE__ */ i(
    "div",
    {
      style: { display: "flex", ...c },
      children: /* @__PURE__ */ i(
        "button",
        {
          onClick: a,
          disabled: r,
          onMouseEnter: () => s(!0),
          onMouseLeave: (d) => {
            s(!1), l.handlers.onPointerLeave(d);
          },
          onPointerDown: l.handlers.onPointerDown,
          "aria-label": e === "left" ? "上一页" : "下一页",
          style: {
            appearance: "none",
            background: o && !r ? t.accentSoft : "transparent",
            border: `1.5px solid ${o && !r ? t.borderAccent : t.borderSubtle}`,
            borderRadius: "50%",
            width: 64,
            height: 64,
            color: r ? t.textFaint : t.textPrimary,
            cursor: r ? "not-allowed" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: r ? 0.25 : 1,
            boxShadow: o && !r ? `0 8px 24px rgba(0,0,0,0.4), 0 0 24px ${t.accentGlow}` : "0 2px 8px rgba(0,0,0,0.2)",
            transform: l.pressed ? "scale(0.92)" : o && !r ? e === "left" ? "translateX(-6px) scale(1.05)" : "translateX(6px) scale(1.05)" : "translateX(0) scale(1)",
            transition: `border-color ${t.durFast}ms ${t.easeOut}, opacity ${t.durFast}ms ${t.easeOut}, transform ${t.durFast}ms ${t.easeOut}, background ${t.durFast}ms ${t.easeOut}, box-shadow ${t.durBase}ms ${t.easeOut}`
          },
          children: /* @__PURE__ */ i("svg", { width: "20", height: "20", viewBox: "0 0 20 20", "aria-hidden": !0, children: e === "left" ? /* @__PURE__ */ i(
            "path",
            {
              d: "M13 3L6 10l7 7",
              stroke: "currentColor",
              strokeWidth: "2",
              fill: "none",
              strokeLinecap: "round",
              strokeLinejoin: "round"
            }
          ) : /* @__PURE__ */ i(
            "path",
            {
              d: "M7 3l7 7-7 7",
              stroke: "currentColor",
              strokeWidth: "2",
              fill: "none",
              strokeLinecap: "round",
              strokeLinejoin: "round"
            }
          ) })
        }
      )
    }
  );
};
function sa(e) {
  const r = new Date(e), a = (Date.now() - e) / 6e4;
  return a < 1 ? "刚刚" : a < 60 ? `${Math.floor(a)} 分钟前` : a < 60 * 24 ? `${Math.floor(a / 60)} 小时前` : r.toLocaleString("zh-CN", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
let he = class extends J {
  /**
   * 注册快存/快读语义动作,然后订阅触发。键位由 KeyBindingSystem 管理:
   *   - default_keys: F5 / F9 (跟之前 settings 默认一致)
   *   - 玩家在"输入按键"tab 改键 → 自动生效,不需要 settings.subscribe
   *   - 跨存档持久化(走 GAME_SETTINGS_TABLE.userKeyBindings)
   */
  static onRegister(e) {
    e.visualUI.onBeforeOpen(ke, async () => {
      await e.archive.cacheGameSnapshot();
    }), e.visualUI.onOpen(ke, (r) => {
      r.onClose(() => e.archive.clearGameSnapshot());
    }), e.input.registerAction({
      id: "avg.internal.default-shell.quick-save",
      label: "快速存档",
      defaultKeys: ["F5"]
    }), e.input.registerAction({
      id: "avg.internal.default-shell.quick-load",
      label: "快速读档",
      defaultKeys: ["F9"]
    }), e.input.onAction("avg.internal.default-shell.quick-save", () => {
      e.archive.quickSave().then(() => A("已快速存档 (F5)", { type: "success" })).catch((r) => {
        console.error("[save-screen] quickSave failed", r), A("快速存档失败", { type: "error" });
      });
    }), e.input.onAction("avg.internal.default-shell.quick-load", async () => {
      try {
        await e.archive.quickLoad() || A("没有可读取的快速存档 (F5 创建)", { type: "warn" });
      } catch (r) {
        console.error("[save-screen] quickLoad failed", r), A("快速读档失败", { type: "error" });
      }
    });
  }
  /**
   * onInit 在 React 把 SaveScreen 渲染进 DOM **之前**触发。
   * 此时画面上还没有 SaveScreen 自身覆盖,触发引擎截图正好拿到"打开存档画面
   * 之前"的纯游戏画面。缓存到 ArchiveSystem,后续点保存复用,完全不闪。
   *
   * 见 archive-system.ts cachedGameSnapshot 字段说明。
   */
  onInit() {
    this.context.archive.cacheGameSnapshot();
  }
  /** onClose 清缓存,避免下次打开 SaveScreen 时还用着上次的旧画面。 */
  onClose() {
    this.context.archive.clearGameSnapshot();
  }
  render() {
    const e = this.data, r = (e == null ? void 0 : e.mode) === "save" || (e == null ? void 0 : e.mode) === "load" ? e.mode : void 0, a = (e == null ? void 0 : e.source) === "title" || (e == null ? void 0 : e.source) === "game" ? e.source : void 0;
    return {
      component: ta,
      props: { mode: r, source: a }
    };
  }
};
ea(he, "settings", X((e) => ({
  slotCount: e.number("槽位数量").default(30).range(1, 200),
  allowDelete: e.boolean("允许删除存档").default(!0)
  // 注:F5 / F9 快捷键由 ctx.input.registerAction (走 KeyBindingSystem) 注册,
  // 玩家在个性化 → 输入按键 tab 改键。
})));
he = Zr([
  q({
    id: "save-screen",
    label: "存档画面",
    exposeUI: !1,
    // 保留快存/快读和截图控制器,React 版不再进入 UI 列表
    autonomous: !0,
    // F5/F9 全局键由 onRegister 绑定
    /**
     * 2026-05 Internal Extension Points §11.2:SaveScreen 同时支持 save / load 两个 slot,
     * 通过 mode payload 区分(由 ctx.system.invoke 透传)。
     *
     * 2026-05-19 实装:ctx.system.invoke(Save) → payload 默认填 { mode: "save" };
     * ctx.system.invoke(Load) → 调用方应该传 { mode: "load" }。
     * 兼容:payload 为空时按 "save" 模式渲染(toolbar 现有调用没传 payload)。
     */
    supportsSlot: [L.Save, L.Load]
  })
], he);
var ia = Object.defineProperty, la = Object.getOwnPropertyDescriptor, da = (e, r, a) => r in e ? ia(e, r, { enumerable: !0, configurable: !0, writable: !0, value: a }) : e[r] = a, ca = (e, r, a, n) => {
  for (var o = n > 1 ? void 0 : n ? la(r, a) : r, s = e.length - 1, l; s >= 0; s--)
    (l = e[s]) && (o = l(o) || o);
  return o;
}, pa = (e, r, a) => da(e, r + "", a);
const ua = () => {
  const e = K(), r = e.history.useSnapshot(), a = e.settings.get("allowVoiceReplay") ?? !0, n = e.settings.get("maxEntries") ?? 200, { phase: o, requestClose: s } = ie(e, "history-screen"), l = r.entries.slice(-n), c = j(null);
  T(() => {
    const y = c.current;
    if (!y) return;
    const w = window.setTimeout(() => {
      y.scrollTop = y.scrollHeight;
    }, 100);
    return () => window.clearTimeout(w);
  }, [l.length]), T(() => {
    const y = (k) => {
      k.key === "Escape" && s();
    }, w = (k) => {
      k.button === 1 && (k.preventDefault(), s());
    };
    return window.addEventListener("keydown", y), window.addEventListener("auxclick", w), () => {
      window.removeEventListener("keydown", y), window.removeEventListener("auxclick", w);
    };
  }, [s]);
  const f = Math.max(0, l.length - 12), u = se(o), g = P({
    hidden: { opacity: 0, transform: "scaleY(0)" },
    delay: 120,
    duration: t.durSlow + 80
  }), p = P({
    hidden: { opacity: 0, transform: "translateY(14px)" },
    delay: 180
  });
  return /* @__PURE__ */ x(
    "div",
    {
      onContextMenu: (y) => {
        y.preventDefault(), s();
      },
      style: {
        position: "absolute",
        inset: 0,
        background: t.bgOverlayStrong,
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        color: t.textPrimary,
        fontFamily: t.fontUI,
        display: "flex",
        flexDirection: "column",
        willChange: "opacity",
        ...u
      },
      children: [
        /* @__PURE__ */ i(
          le,
          {
            eyebrow: "History",
            title: "历史回顾",
            phase: o,
            rightSlot: /* @__PURE__ */ x(te, { children: [
              /* @__PURE__ */ x(
                "span",
                {
                  style: {
                    fontFamily: t.fontMono,
                    fontSize: 14,
                    color: t.textMuted,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    marginRight: 4
                  },
                  children: [
                    l.length,
                    " 条"
                  ]
                }
              ),
              /* @__PURE__ */ i(re, { onClick: s })
            ] })
          }
        ),
        /* @__PURE__ */ i(
          "div",
          {
            ref: c,
            className: "avg-shell-scrollbar",
            style: {
              flex: 1,
              overflowY: "auto",
              padding: "24px 80px 80px"
            },
            children: /* @__PURE__ */ x(
              "div",
              {
                style: {
                  maxWidth: 880,
                  margin: "0 auto",
                  position: "relative"
                },
                children: [
                  /* @__PURE__ */ i(
                    "div",
                    {
                      style: {
                        position: "absolute",
                        left: 156,
                        top: 8,
                        bottom: 8,
                        width: 1.5,
                        background: `linear-gradient(180deg, transparent 0%, ${t.borderRegular} 8%, ${t.borderRegular} 92%, transparent 100%)`,
                        transformOrigin: "top",
                        ...g
                      }
                    }
                  ),
                  l.length === 0 && /* @__PURE__ */ i(
                    "div",
                    {
                      style: {
                        textAlign: "center",
                        marginTop: 100,
                        fontFamily: t.fontDisplay,
                        fontSize: 22,
                        color: t.textFaint,
                        fontWeight: 500,
                        ...p
                      },
                      children: "暂无历史记录"
                    }
                  ),
                  l.map((y, w) => {
                    const k = w >= f, E = k ? 140 + (w - f) * 30 : 0;
                    return /* @__PURE__ */ i(
                      fa,
                      {
                        speaker: y.name,
                        text: y.text,
                        voiceUri: a ? y.voiceUri : void 0,
                        isChoice: !!y.isChoice,
                        onReplay: (C) => void e.history.replayVoice(C),
                        animationDelay: E,
                        shouldAnimate: k
                      },
                      y.uuid ?? w
                    );
                  })
                ]
              }
            )
          }
        )
      ]
    }
  );
}, fa = ({
  speaker: e,
  text: r,
  voiceUri: a,
  isChoice: n,
  onReplay: o,
  animationDelay: s,
  shouldAnimate: l
}) => {
  const [c, d] = _(!1), f = P({
    hidden: l ? { opacity: 0, transform: "translateY(12px) scale(0.98)" } : {},
    delay: s
  });
  return /* @__PURE__ */ i("div", { style: l ? f : void 0, children: /* @__PURE__ */ x(
    "div",
    {
      onMouseEnter: () => d(!0),
      onMouseLeave: () => d(!1),
      style: {
        display: "grid",
        gridTemplateColumns: "144px 24px 1fr auto",
        gap: 16,
        padding: "18px 16px",
        position: "relative",
        alignItems: "start",
        borderRadius: t.radiusMd,
        background: c ? t.accentSoft : "transparent",
        marginLeft: -16,
        marginRight: -16,
        transition: `background ${t.durBase}ms ${t.easeOut}`
      },
      children: [
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              fontFamily: t.fontUI,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.02em",
              color: n ? t.accent : t.textPrimary,
              textAlign: "right",
              paddingTop: 2,
              paddingRight: 8
            },
            children: n ? "▸ 选择" : e || ""
          }
        ),
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              position: "relative",
              height: "100%",
              display: "flex",
              justifyContent: "center"
            },
            children: /* @__PURE__ */ i(
              "div",
              {
                style: {
                  width: 10,
                  height: 10,
                  marginTop: 8,
                  borderRadius: "50%",
                  background: c || n ? t.accent : t.borderStrong,
                  border: `2.5px solid ${t.bgOverlayStrong}`,
                  transition: `background ${t.durFast}ms ${t.easeOut}, transform ${t.durFast}ms ${t.easeOut}`,
                  transform: c ? "scale(1.4)" : "scale(1)",
                  boxShadow: c ? `0 0 0 6px ${t.accentSoft}, 0 0 16px ${t.accentGlow}` : "none"
                }
              }
            )
          }
        ),
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              fontSize: 16,
              lineHeight: 1.7,
              color: n ? t.accent : t.textPrimary,
              fontStyle: "normal",
              fontWeight: n ? 600 : 400,
              paddingTop: 0,
              textWrap: "pretty"
            },
            children: r
          }
        ),
        /* @__PURE__ */ i("div", { style: { paddingTop: 0 }, children: a && /* @__PURE__ */ i(
          ga,
          {
            onClick: () => o(a),
            highlight: c
          }
        ) })
      ]
    }
  ) });
}, ga = ({ onClick: e, highlight: r }) => {
  const a = H();
  return /* @__PURE__ */ i(
    "button",
    {
      onClick: e,
      onPointerDown: a.handlers.onPointerDown,
      onPointerLeave: a.handlers.onPointerLeave,
      "aria-label": "重播语音",
      title: "重播语音",
      style: {
        appearance: "none",
        width: 36,
        height: 36,
        borderRadius: "50%",
        border: `1.5px solid ${r ? t.borderAccent : t.borderSubtle}`,
        background: r ? t.accentSoft : "transparent",
        color: r ? t.accent : t.textMuted,
        cursor: "default",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: a.pressed ? "scale(0.92)" : "scale(1)",
        transition: `all ${t.durFast}ms ${t.easeOut}`,
        boxShadow: r ? `0 0 12px ${t.accentGlow}` : "none"
      },
      children: /* @__PURE__ */ i("svg", { width: "13", height: "13", viewBox: "0 0 13 13", "aria-hidden": !0, children: /* @__PURE__ */ i(
        "path",
        {
          d: "M3 2.5v8l7-4z",
          fill: "currentColor",
          stroke: "currentColor",
          strokeWidth: "0.5",
          strokeLinejoin: "round"
        }
      ) })
    }
  );
};
let xe = class extends J {
  /**
   * 注册"打开历史画面"语义动作 + 订阅触发。键位由 KeyBindingSystem 管理:
   *   - default_keys: middleclick (鼠标中键,跟之前 settings 默认一致)
   *   - 玩家在"输入按键"tab 改键 → 自动生效
   */
  static onRegister(e) {
    e.input.registerAction({
      id: "avg.internal.default-shell.open-history",
      label: "呼出历史画面",
      defaultKeys: ["middleclick"]
    }), e.input.onAction("avg.internal.default-shell.open-history", () => {
      e.system.invoke(L.History, void 0, {
        modal: !0
      });
    });
  }
  render() {
    return { component: ua, props: {} };
  }
};
pa(xe, "settings", X((e) => ({
  maxEntries: e.number("最大历史条数").default(200).range(10, 1e3).step(10),
  allowVoiceReplay: e.boolean("允许语音重播").default(!0)
  // 注:呼出快捷键由 ctx.input.registerAction (走 KeyBindingSystem) 注册,
  // 玩家在个性化 → 输入按键 tab 改键。
})));
xe = ca([
  q({
    id: "history-screen",
    label: "历史画面",
    exposeUI: !1,
    // 保留呼出快捷键,React 版不再进入 UI 列表
    autonomous: !0,
    // 全局打开历史快捷键由 onRegister 绑定
    /** 2026-05 Internal Extension Points §6.1:声明本 UI 实现"历史"槽位。 */
    supportsSlot: L.History
  })
], xe);
const Ht = 50, ya = 100;
function ma(e) {
  if (typeof e == "number")
    return Number.isFinite(e) ? e : null;
  if (typeof e != "string" || e.trim() === "") return null;
  const r = Number(e);
  return Number.isFinite(r) ? r : null;
}
function ba(e) {
  const r = ma(e);
  return r === null ? Ht : Math.round(Math.max(0, Math.min(ya, r)));
}
const Ce = Ht;
function ae(e) {
  return ba(e);
}
var ha = Object.defineProperty, xa = Object.getOwnPropertyDescriptor, va = (e, r, a) => r in e ? ha(e, r, { enumerable: !0, configurable: !0, writable: !0, value: a }) : e[r] = a, Sa = (e, r, a, n) => {
  for (var o = n > 1 ? void 0 : n ? xa(r, a) : r, s = e.length - 1, l; s >= 0; s--)
    (l = e[s]) && (o = l(o) || o);
  return o;
}, wa = (e, r, a) => va(e, r + "", a);
const Ma = () => {
  const e = K(), r = e.settings.get("allowReset") ?? !0, { phase: a, requestClose: n } = ie(e, "settings-screen"), [o, s] = e.config.useValue("masterVolume"), [l, c] = e.config.useValue("bgmVolume"), [d, f] = e.config.useValue("seVolume"), [u, g] = e.config.useValue("voiceVolume"), [p, b] = e.config.useValue("textSpeed"), [y, w] = e.config.useValue("autoModeTextSpeed"), [k, E] = e.config.useValue("skipMode"), [C, z] = e.config.useValue(
    "stopVoiceOnNextDialogue"
  ), M = e.game.window.canFullscreen(), [D, S] = e.game.window.useFullscreen(), F = () => {
    e.config.reset();
  };
  T(() => {
    const v = (m) => {
      m.key === "Escape" && n();
    };
    return window.addEventListener("keydown", v), () => window.removeEventListener("keydown", v);
  }, [n]);
  const h = 120, I = 35, O = 80, R = h + O * 2, W = se(a), [Q, Z] = _(!1);
  return T(() => {
    const v = window.setTimeout(() => Z(!0), 100);
    return () => window.clearTimeout(v);
  }, []), /* @__PURE__ */ x(
    "div",
    {
      onContextMenu: (v) => {
        v.preventDefault(), n();
      },
      style: {
        position: "absolute",
        inset: 0,
        background: t.bgOverlay,
        backdropFilter: Q ? "blur(24px)" : "none",
        WebkitBackdropFilter: Q ? "blur(24px)" : "none",
        color: t.textPrimary,
        fontFamily: t.fontUI,
        display: "flex",
        flexDirection: "column",
        ...W
      },
      children: [
        /* @__PURE__ */ i(
          le,
          {
            eyebrow: "Preferences",
            title: "设置",
            phase: a,
            rightSlot: /* @__PURE__ */ x(te, { children: [
              r && /* @__PURE__ */ i(Or, { onClick: F, children: "恢复默认" }),
              /* @__PURE__ */ i(re, { onClick: n })
            ] })
          }
        ),
        /* @__PURE__ */ i(
          "div",
          {
            className: "avg-shell-scrollbar",
            style: {
              flex: 1,
              overflowY: "auto",
              padding: "32px 80px 80px"
            },
            children: /* @__PURE__ */ x(
              "div",
              {
                style: {
                  maxWidth: 880,
                  margin: "0 auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 40
                },
                children: [
                  /* @__PURE__ */ x(fe, { title: "音量", sectionDelay: h - 40, phase: a, children: [
                    /* @__PURE__ */ i(
                      U,
                      {
                        label: "主音量",
                        value: o ?? 100,
                        onChange: (v) => s(v),
                        delay: h + I * 0,
                        phase: a
                      }
                    ),
                    /* @__PURE__ */ i(
                      U,
                      {
                        label: "背景音乐",
                        value: l ?? 100,
                        onChange: (v) => c(v),
                        delay: h + I * 1,
                        phase: a
                      }
                    ),
                    /* @__PURE__ */ i(
                      U,
                      {
                        label: "音效",
                        value: d ?? 100,
                        onChange: (v) => f(v),
                        delay: h + I * 2,
                        phase: a
                      }
                    ),
                    /* @__PURE__ */ i(
                      U,
                      {
                        label: "语音",
                        value: u ?? 100,
                        onChange: (v) => g(v),
                        delay: h + I * 3,
                        phase: a,
                        isLast: !0
                      }
                    )
                  ] }),
                  /* @__PURE__ */ x(fe, { title: "文本与播放", sectionDelay: h + O, phase: a, children: [
                    /* @__PURE__ */ i(
                      U,
                      {
                        label: "文本速度",
                        value: ae(
                          p ?? Ce
                        ),
                        onChange: (v) => b(ae(v)),
                        delay: h + O + I * 1,
                        phase: a
                      }
                    ),
                    /* @__PURE__ */ i(
                      U,
                      {
                        label: "自动播放速度",
                        value: ae(
                          y ?? Ce
                        ),
                        onChange: (v) => w(ae(v)),
                        delay: h + O + I * 2,
                        phase: a
                      }
                    ),
                    /* @__PURE__ */ i(oe, { label: "跳过模式", delay: h + O + I * 3, phase: a, children: /* @__PURE__ */ i(
                      Fe,
                      {
                        options: [
                          { value: "read", label: "只跳已读" },
                          { value: "all", label: "全部跳过" }
                        ],
                        value: k ?? "read",
                        onChange: (v) => E(v)
                      }
                    ) }),
                    /* @__PURE__ */ i(oe, { label: "切换对话停止上句语音", delay: h + O + I * 4, phase: a, isLast: !0, children: /* @__PURE__ */ i(
                      _a,
                      {
                        checked: !!C,
                        onChange: (v) => z(v)
                      }
                    ) })
                  ] }),
                  M && /* @__PURE__ */ i(
                    fe,
                    {
                      title: "显示",
                      sectionDelay: R,
                      phase: a,
                      children: /* @__PURE__ */ i(
                        oe,
                        {
                          label: "屏幕模式",
                          delay: R + I,
                          phase: a,
                          isLast: !0,
                          children: /* @__PURE__ */ i(
                            Fe,
                            {
                              options: [
                                { value: "windowed", label: "窗口" },
                                { value: "fullscreen", label: "全屏" }
                              ],
                              value: D ? "fullscreen" : "windowed",
                              onChange: (v) => S(v === "fullscreen")
                            }
                          )
                        }
                      )
                    }
                  )
                ]
              }
            )
          }
        )
      ]
    }
  );
}, fe = ({ title: e, sectionDelay: r, children: a }) => {
  const n = P({
    hidden: { opacity: 0, transform: "translateX(-16px)" },
    delay: r
  }), o = P({
    hidden: { opacity: 0, transform: "scaleX(0)" },
    delay: r + 60
  });
  return /* @__PURE__ */ x("section", { children: [
    /* @__PURE__ */ x(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          marginBottom: 20,
          ...n
        },
        children: [
          /* @__PURE__ */ i(
            "h3",
            {
              style: {
                fontFamily: t.fontDisplay,
                fontSize: 24,
                fontWeight: 700,
                margin: 0,
                letterSpacing: "0.005em"
              },
              children: e
            }
          ),
          /* @__PURE__ */ i(
            "div",
            {
              style: {
                flex: 1,
                height: 1,
                background: `linear-gradient(90deg, ${t.borderRegular} 0%, transparent 100%)`,
                transformOrigin: "left",
                ...o
              }
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ i(
      "div",
      {
        style: {
          background: t.bgSurface,
          border: `1px solid ${t.borderSubtle}`,
          borderRadius: t.radiusLg,
          padding: "8px 32px",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)"
        },
        children: a
      }
    )
  ] });
}, oe = ({ label: e, delay: r, isLast: a, children: n }) => {
  const o = P({
    hidden: { opacity: 0, transform: "translateY(12px) scale(0.98)" },
    delay: r
  });
  return /* @__PURE__ */ x(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "20px 0",
        borderBottom: a ? "none" : `1px solid ${t.borderSubtle}`,
        ...o
      },
      children: [
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              minWidth: 200,
              fontSize: 16,
              color: t.textPrimary,
              fontWeight: 500
            },
            children: e
          }
        ),
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              flex: 1,
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center"
            },
            children: n
          }
        )
      ]
    }
  );
}, U = ({ label: e, value: r, onChange: a, delay: n, phase: o, isLast: s }) => {
  const l = Number.isFinite(r) ? Math.max(0, Math.min(100, r)) : 0;
  return /* @__PURE__ */ x(oe, { label: e, delay: n, phase: o, isLast: s, children: [
    /* @__PURE__ */ i(ka, { value: l, onChange: a, min: 0, max: 100 }),
    /* @__PURE__ */ i(
      "div",
      {
        style: {
          fontFamily: t.fontMono,
          fontSize: 14,
          color: t.textPrimary,
          minWidth: 48,
          textAlign: "right",
          paddingLeft: 20,
          fontVariantNumeric: "tabular-nums",
          fontWeight: 600
        },
        children: Math.round(l)
      }
    )
  ] });
}, ka = ({ value: e, min: r, max: a, onChange: n }) => {
  const o = j(null), [s, l] = _(!1), [c, d] = _(!1), u = ((Number.isFinite(e) ? Math.max(r, Math.min(a, e)) : r) - r) / (a - r) * 100, g = (p) => {
    const b = o.current;
    if (!b) return;
    const y = b.getBoundingClientRect(), w = Math.max(0, Math.min(1, (p - y.left) / y.width));
    n(r + w * (a - r));
  };
  return T(() => {
    if (!s) return;
    const p = (y) => g(y.clientX), b = () => l(!1);
    return window.addEventListener("pointermove", p), window.addEventListener("pointerup", b), () => {
      window.removeEventListener("pointermove", p), window.removeEventListener("pointerup", b);
    };
  }, [s]), /* @__PURE__ */ x(
    "div",
    {
      ref: o,
      onPointerDown: (p) => {
        l(!0), g(p.clientX);
      },
      onMouseEnter: () => d(!0),
      onMouseLeave: () => d(!1),
      style: {
        position: "relative",
        flex: 1,
        height: 28,
        display: "flex",
        alignItems: "center",
        cursor: "default",
        userSelect: "none"
      },
      children: [
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              position: "absolute",
              left: 0,
              right: 0,
              height: 5,
              background: t.borderSubtle,
              borderRadius: 999
            }
          }
        ),
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              position: "absolute",
              left: 0,
              width: `${u}%`,
              height: 5,
              background: `linear-gradient(90deg, ${t.accent} 0%, ${t.accent} 100%)`,
              borderRadius: 999,
              boxShadow: c || s ? `0 0 12px ${t.accentGlow}` : "none",
              transition: s ? "none" : `width ${t.durFast}ms ${t.easeOut}, box-shadow ${t.durBase}ms ${t.easeOut}`
            }
          }
        ),
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              position: "absolute",
              left: `${u}%`,
              width: 20,
              height: 20,
              marginLeft: -10,
              borderRadius: "50%",
              background: t.textPrimary,
              boxShadow: s || c ? `0 0 0 8px ${t.accentSoft}, 0 4px 12px rgba(0,0,0,0.5)` : "0 2px 8px rgba(0,0,0,0.4)",
              transform: s ? "scale(1.18)" : c ? "scale(1.08)" : "scale(1)",
              transition: s ? `box-shadow ${t.durFast}ms ${t.easeOut}, transform ${t.durFast}ms ${t.easeOut}` : `left ${t.durFast}ms ${t.easeOut}, box-shadow ${t.durFast}ms ${t.easeOut}, transform ${t.durFast}ms ${t.easeOut}`
            }
          }
        )
      ]
    }
  );
}, Fe = ({ options: e, value: r, onChange: a }) => {
  const n = e.findIndex((s) => s.value === r), o = n >= 0 ? n : 0;
  return /* @__PURE__ */ x(
    "div",
    {
      style: {
        position: "relative",
        display: "inline-flex",
        background: t.bgSunken,
        border: `1px solid ${t.borderSubtle}`,
        borderRadius: t.radiusMd,
        padding: 4
      },
      children: [
        /* @__PURE__ */ i(
          "div",
          {
            style: {
              position: "absolute",
              top: 4,
              bottom: 4,
              left: `calc(${o} * (100% - 8px) / ${e.length} + 4px)`,
              width: `calc((100% - 8px) / ${e.length})`,
              background: t.accent,
              borderRadius: t.radiusSm,
              transition: `left ${t.durBase}ms ${t.easeOut}`,
              boxShadow: `0 2px 12px ${t.accentGlow}`
            }
          }
        ),
        e.map((s) => /* @__PURE__ */ i(
          $a,
          {
            active: s.value === r,
            onClick: () => a(s.value),
            children: s.label
          },
          s.value
        ))
      ]
    }
  );
}, $a = ({ active: e, onClick: r, children: a }) => {
  const n = H();
  return /* @__PURE__ */ i(
    "button",
    {
      ...n.handlers,
      onClick: r,
      style: {
        position: "relative",
        zIndex: 1,
        appearance: "none",
        background: "transparent",
        border: "none",
        padding: "10px 24px",
        fontSize: 14,
        fontFamily: t.fontUI,
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: e ? t.textOnAccent : t.textMuted,
        cursor: "default",
        minWidth: 116,
        transform: n.pressed ? "scale(0.96)" : "scale(1)",
        transition: `color ${t.durFast}ms ${t.easeOut}, transform ${t.durFast}ms ${t.easeOut}`
      },
      children: a
    }
  );
}, _a = ({ checked: e, onChange: r }) => {
  const a = H();
  return /* @__PURE__ */ i(
    "button",
    {
      ...a.handlers,
      onClick: () => r(!e),
      role: "switch",
      "aria-checked": e,
      style: {
        appearance: "none",
        position: "relative",
        width: 52,
        height: 30,
        borderRadius: 999,
        border: `1px solid ${e ? t.borderAccent : t.borderRegular}`,
        background: e ? t.accent : t.bgSunken,
        cursor: "default",
        padding: 0,
        transform: a.pressed ? "scale(0.94)" : "scale(1)",
        transition: `background ${t.durBase}ms ${t.easeOut}, border-color ${t.durBase}ms ${t.easeOut}, transform ${t.durFast}ms ${t.easeOut}`,
        boxShadow: e ? `0 0 16px ${t.accentGlow}` : "none"
      },
      children: /* @__PURE__ */ i(
        "div",
        {
          style: {
            position: "absolute",
            top: 3,
            left: e ? 24 : 3,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: e ? t.textOnAccent : t.textPrimary,
            boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
            transition: `left ${t.durBase}ms ${t.easeOut}, background ${t.durBase}ms ${t.easeOut}`
          }
        }
      )
    }
  );
};
let ve = class extends J {
  /**
   * 可视化设置界面(本扩展 ui/settings-screen.json)的控制器 ——
   * 扩展复合容器(视图/控制器)的第一个 dogfooding:布局住在 JSON
   * (编辑器可看可拷可改),动态行为在这里操作控件。
   * 「设置」槽位默认绑定 "ui:@avg.internal.default-shell/settings-screen"。
   * 本类只保留控制器职责,不再向 UI host 导出 React 版画面。
   */
  static onRegister(e) {
    e.visualUI.onOpen(
      "@avg.internal.default-shell/settings-screen",
      (r) => {
        var o;
        if (!e.game.window.canFullscreen())
          for (const s of [
            "display-card",
            "display-title",
            "display-label",
            "display-switch"
          ])
            (o = r.get(s)) == null || o.setHidden(!0);
        const a = r.get("reset-btn");
        let n;
        a == null || a.on("click", () => {
          n !== void 0 && clearTimeout(n), a.setProps({ text: "正在恢复…" }), e.config.reset().then(() => {
            a.setProps({ text: "已恢复" }), n = setTimeout(() => {
              a.setProps({ text: "恢复默认" });
            }, 1e3);
          }).catch((s) => {
            console.error("[settings-screen] 恢复默认设置失败", s), a.setProps({ text: "恢复失败" }), n = setTimeout(() => {
              a.setProps({ text: "恢复默认" });
            }, 1400);
          });
        }), r.onClose(() => {
          n !== void 0 && clearTimeout(n);
        });
      }
    );
  }
  render() {
    return { component: Ma, props: {} };
  }
};
wa(ve, "settings", X((e) => ({
  allowReset: e.boolean("允许重置默认").default(!0)
})));
ve = Sa([
  q({
    id: "settings-screen",
    label: "设置画面",
    exposeUI: !1,
    // 保留可视化界面控制器,React 版不再进入 UI 列表
    // 2026-05 Internal Extension Points §6.1:声明本 UI 实现"设置"槽位。
    supportsSlot: L.Settings
  })
], ve);
var Ca = Object.defineProperty, Fa = Object.getOwnPropertyDescriptor, Ia = (e, r, a) => r in e ? Ca(e, r, { enumerable: !0, configurable: !0, writable: !0, value: a }) : e[r] = a, Oa = (e, r, a, n) => {
  for (var o = n > 1 ? void 0 : n ? Fa(r, a) : r, s = e.length - 1, l; s >= 0; s--)
    (l = e[s]) && (o = l(o) || o);
  return o;
}, Pa = (e, r, a) => Ia(e, r + "", a);
const La = [
  { key: "skip", label: "跳过" },
  { key: "auto", label: "自动" },
  { key: "save", label: "存档" },
  { key: "load", label: "读档" },
  { key: "quickSave", label: "快存" },
  { key: "quickLoad", label: "快读" },
  { key: "history", label: "历史" },
  { key: "settings", label: "设置" },
  { key: "hide", label: "隐藏" }
], Ta = () => {
  const e = K(), r = e.settings.useValue("showToolbar")[0] ?? !0, a = e.settings.useValue("showSkip")[0] ?? !0, n = e.settings.useValue("showAuto")[0] ?? !0, o = e.settings.useValue("showSave")[0] ?? !0, s = e.settings.useValue("showLoad")[0] ?? !0, l = e.settings.useValue("showQuickSave")[0] ?? !0, c = e.settings.useValue("showQuickLoad")[0] ?? !0, d = e.settings.useValue("showHistory")[0] ?? !0, f = e.settings.useValue("showSettings")[0] ?? !0, u = e.settings.useValue("showHide")[0] ?? !0, g = e.dialogue.useSkipMode(), p = e.dialogue.useAutoMode(), b = {
    skip: g ? "SKIP" : void 0,
    auto: p ? "AUTO" : void 0
  }, y = {
    skip: a,
    auto: n,
    save: o,
    load: s,
    quickSave: l,
    quickLoad: c,
    history: d,
    settings: f,
    hide: u
  }, [w, k] = _(!1);
  T(() => {
    const M = requestAnimationFrame(() => k(!0));
    return () => cancelAnimationFrame(M);
  }, []);
  const [E, C] = _(null);
  if (!r) return null;
  const z = (M) => {
    M === "skip" ? e.dialogue.toggleSkipMode() : M === "auto" ? e.dialogue.toggleAutoMode() : M === "settings" ? e.system.invoke(L.Settings, void 0, {
      modal: !0
    }) : M === "save" ? e.system.invoke(
      L.Save,
      { mode: "save" },
      { modal: !0 }
    ) : M === "load" ? e.system.invoke(
      L.Load,
      { mode: "load", source: "game" },
      { modal: !0 }
    ) : M === "history" ? e.system.invoke(L.History, void 0, {
      modal: !0
    }) : M === "quickSave" ? e.archive.quickSave().then(() => A("已快速存档", { type: "success" })).catch((D) => {
      console.error("[toolbar] quickSave failed", D), A("快速存档失败", { type: "error" });
    }) : M === "quickLoad" ? (async () => {
      try {
        await e.archive.quickLoad() || A("没有可读取的快速存档", { type: "warn" });
      } catch (D) {
        console.error("[toolbar] quickLoad failed", D), A("快速读档失败", { type: "error" });
      }
    })() : M === "hide" && e.dialogue.hideBox();
  };
  return /* @__PURE__ */ i(
    "div",
    {
      style: {
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none"
      },
      children: /* @__PURE__ */ i(
        "div",
        {
          style: {
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "rgba(11, 13, 16, 0.82)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
            border: `1px solid ${t.borderSubtle}`,
            borderRadius: t.radiusPill,
            padding: "8px 12px",
            boxShadow: "0 18px 48px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(255,255,255,0.02)",
            transform: w ? "translateY(0)" : "translateY(20px)",
            opacity: w ? 1 : 0,
            transition: `transform ${t.durSlow}ms ${t.easeOut}, opacity ${t.durBase}ms ${t.easeOut}`
          },
          children: La.map((M) => y[M.key] ? /* @__PURE__ */ i(
            za,
            {
              isHover: E === M.key,
              activeBadge: b[M.key],
              onMouseEnter: () => C(M.key),
              onMouseLeave: () => C(null),
              onClick: () => z(M.key),
              children: M.label
            },
            M.key
          ) : null)
        }
      )
    }
  );
}, za = ({
  isHover: e,
  activeBadge: r,
  onMouseEnter: a,
  onMouseLeave: n,
  onClick: o,
  children: s
}) => {
  const l = H(), c = !!r;
  return /* @__PURE__ */ x(
    "button",
    {
      onMouseEnter: a,
      onMouseLeave: (d) => {
        n(), l.handlers.onPointerLeave(d);
      },
      onPointerDown: l.handlers.onPointerDown,
      onClick: o,
      style: {
        position: "relative",
        appearance: "none",
        // active 态优先级高于 hover —— 让"自动播放中"始终以 accent 配色呈现,
        // 即便鼠标没悬停也能识别。
        background: c || e ? t.accentSoft : "transparent",
        border: "none",
        color: c || e ? t.accent : t.textPrimary,
        fontFamily: t.fontUI,
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: "0.08em",
        padding: "10px 20px",
        borderRadius: t.radiusPill,
        cursor: "default",
        transform: l.pressed ? "scale(0.94) translateY(0)" : e ? "translateY(-2px) scale(1.02)" : "translateY(0) scale(1)",
        transition: `color ${t.durFast}ms ${t.easeOut}, background ${t.durFast}ms ${t.easeOut}, transform ${t.durFast}ms ${t.easeOut}`,
        // 呼吸动画只在 active 态运行;否则 animation:none 让 transition 接管样式。
        animation: c ? "avg-toolbar-active-breath 2.4s ease-in-out infinite" : "none"
      },
      children: [
        s,
        r && /* @__PURE__ */ i(
          "span",
          {
            "aria-hidden": !0,
            style: {
              position: "absolute",
              top: -4,
              right: -4,
              padding: "2px 6px",
              background: t.accent,
              color: t.textOnAccent,
              borderRadius: 999,
              fontFamily: t.fontMono,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.12em",
              lineHeight: 1.1,
              boxShadow: `0 0 10px ${t.accentGlow}`,
              pointerEvents: "none"
            },
            children: r
          }
        )
      ]
    }
  );
}, Ie = /* @__PURE__ */ new WeakSet();
let Se = class extends J {
  /**
   * Toolbar 跟随 dialogue 显隐 —— 当 dialogue.line() 非空时显示,空时隐藏。
   * 订阅 dialogue:changed,值变 → ensureToolbarVisibility 同步状态。
   */
  static onRegister(e) {
    const r = e.getHost(), a = r == null ? void 0 : r.application;
    if (a && Ie.has(a)) return;
    a && Ie.add(a);
    let n = !1, o = null, s = !1, l = 0;
    const c = async () => {
      if (!s) {
        s = !0;
        try {
          for (; o === null || o !== n; ) {
            const f = n, u = l;
            try {
              f ? await e.system.invoke(L.Toolbar) : await e.system.close(L.Toolbar), o = f;
            } catch (g) {
              if (f !== n || u !== l)
                continue;
              console.warn(
                f ? "[toolbar] 工具栏系统槽位打开失败" : "[toolbar] 工具栏系统槽位关闭失败",
                g
              );
              return;
            }
          }
        } finally {
          s = !1;
        }
      }
    }, d = () => {
      const f = e.settings.get("showToolbar") ?? !0, u = e.dialogue.line() !== null;
      n = f && u, l += 1, c();
    };
    e.subscribe("dialogue:changed", d), e.settings.subscribe("showToolbar", d), d();
  }
  render() {
    return { component: Ta, props: {} };
  }
};
Pa(Se, "settings", X((e) => ({
  // 总开关:整个工具栏是否在对话期间显示。
  // 关闭后,所有按钮一并隐藏 —— 这是相对下面按钮级开关更高一层的"模块级"开关。
  showToolbar: e.boolean("显示对话工具栏").default(!0),
  // 下面每个按钮级开关用 enabledWhen 挂到总开关上:总开关关掉时,
  // 它们在设置面板里置灰(不可点),但各自的值保持不变 —— 重开总开关后恢复。
  showSkip: e.boolean("显示跳过按钮").default(!0).enabledWhen("showToolbar"),
  showAuto: e.boolean("显示自动播放按钮").default(!0).enabledWhen("showToolbar"),
  showSave: e.boolean("显示存档按钮").default(!0).enabledWhen("showToolbar"),
  showLoad: e.boolean("显示读档按钮").default(!0).enabledWhen("showToolbar"),
  showQuickSave: e.boolean("显示快速存档按钮").default(!0).enabledWhen("showToolbar"),
  showQuickLoad: e.boolean("显示快速读档按钮").default(!0).enabledWhen("showToolbar"),
  showHistory: e.boolean("显示历史按钮").default(!0).enabledWhen("showToolbar"),
  showSettings: e.boolean("显示设置按钮").default(!0).enabledWhen("showToolbar"),
  showHide: e.boolean("显示隐藏对话框按钮").default(!0).enabledWhen("showToolbar")
})));
Se = Oa([
  q({
    id: "toolbar",
    label: "工具栏",
    exposeUI: !1,
    // 保留跟随对话显隐的控制器,React 版不再进入 UI 列表
    autonomous: !0
    // toolbar 跟随 dialogue 显隐
    // 本类只负责跟随 dialogue 显隐；实际打开哪份工具栏由 Toolbar 系统槽位决定。
  })
], Se);
const Ea = /* @__PURE__ */ Object.assign({ "../ui/choice-dialog.json": Nt, "../ui/dialogue-box.json": Xt, "../ui/gallery-screen.json": Jt, "../ui/history-screen.json": Qt, "../ui/input-dialog.json": er, "../ui/message-box.json": rr, "../ui/paragraph-cinematic-centered.json": or, "../ui/paragraph-handwritten.json": sr, "../ui/paragraph-literary.json": lr, "../ui/paragraph-sharp.json": cr, "../ui/paragraph.json": ur, "../ui/save-screen.json": gr, "../ui/settings-screen.json": mr, "../ui/title-screen.json": hr, "../ui/toolbar.json": vr }), Wa = Object.fromEntries(
  Object.entries(Ea).map(([e, r]) => [
    e.replace(/^.*\/([^/]+)\.json$/, "$1"),
    r.default
  ])
);
export {
  V as GalleryScreen,
  xe as HistoryScreen,
  he as SaveScreen,
  ve as SettingsScreen,
  ye as TitleScreen,
  Se as Toolbar,
  At as manifest,
  Wa as visualUI
};
