import chroma from 'chroma-js'
import { LCH, RGB, spaceName, TColor, XYZ } from '../types'
import { clamp } from '../utils'
import { oklch, cielch } from './colorModels'
import {
  isWithinGamut,
  forceIntoGamut,
  srgb2hex,
  // hex2rgb,
  xyz2rgb,
  rgb2xyz,
  xyz2p3,
  p32xyz,
  xyz2rec2020,
} from './utils'

export const colorSpaces = {
  [spaceName.oklch]: colorSpaceMaker(oklch),
  [spaceName.cielch]: colorSpaceMaker(cielch),
}

export type TLchModel = {
  name: spaceName
  ranges: {
    l: { min: number; max: number; step: number; precision: number }
    c: { min: number; max: number; step: number; precision: number }
    h: { min: number; max: number; step: number; precision: number }
  }
  xyz2lch: (xyz: XYZ) => LCH
  lch2xyz: (lch: LCH) => XYZ
}

export type TColorSpace = {
  name: TLchModel['name']
  ranges: TLchModel['ranges']
  hex2color: (hex: string) => TColor | null
  lch2color: (lch: LCH) => TColor
}

/** Makes color space object with essential functions */
function colorSpaceMaker(colorSpace: TLchModel): TColorSpace {
  const { lch2xyz, xyz2lch, ranges, name } = colorSpace

  // Full conversions
  const lch2rgb = (lch: LCH) => xyz2rgb(lch2xyz(lch))
  const rgb2lch = (rgb: RGB) => xyz2lch(rgb2xyz(rgb))

  function lch2color(lch: LCH): TColor {
    const xyz = lch2xyz(lch)
    const srgb = xyz2rgb(xyz)
    const within_sRGB = isWithinGamut(srgb)
    const [r, g, b] = srgb.map(c => clamp(c * 255, 0, 255))
    const [l, c, h] = lch
    const p3 = xyz2p3(xyz).map(c => clamp(c * 255, 0, 255)) as [
      number,
      number,
      number
    ]

    // prettier-ignore
    return {
      mode: name,
      l, c, h,
      r, g, b,
      p3,
      get hex () {
        const rgb = within_sRGB ? srgb : forceIntoGamut(lch, lch2rgb)
        return srgb2hex(rgb)
      },
      get css () {
        if (within_sRGB) return this.hex
        if (this.within_P3) {
          const [r, g, b] = p3
          return `color(display-p3 ${r / 255} ${g / 255} ${b / 255})`
        }
        return this.hex
      },
      within_sRGB,
      get within_P3 () {
        return within_sRGB || isWithinGamut(xyz2p3(xyz))
      },
      get within_Rec2020 () {
        return within_sRGB || this.within_P3 || isWithinGamut(xyz2rec2020(xyz))
      },
    }
  }

  function hex2color(hex: string): TColor | null {
    // Handle CSS color(display-p3 ...) format
    if (hex.startsWith('color(display-p3')) {
      const match = hex.match(
        /color\(display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/
      )
      if (match) {
        const p3: RGB = [
          parseFloat(match[1]),
          parseFloat(match[2]),
          parseFloat(match[3]),
        ]

        // Convert P3 to XYZ, then to LCH, then use lch2color to get full object
        // We need to export p32xyz from utils or construct it here
        // In utils we have exposed `p32xyz` now.
        const xyz = p32xyz(p3)
        const lch = xyz2lch(xyz)
        return lch2color(lch)
      }
    }

    if (!chroma.valid(hex)) return null
    const rgb = chroma(hex)
      .rgb()
      .map(c => c / 255) as RGB
    if (!rgb) return null
    const [l, c, h] = rgb2lch(rgb)
    const [r, g, b] = rgb.map(c => clamp(c * 255, 0, 255))
    const p3 = xyz2p3(rgb2xyz(rgb)).map(c => clamp(c * 255, 0, 255)) as [
      number,
      number,
      number
    ]

    // prettier-ignore
    return {
      mode: name,
      l, c, h,
      r, g, b,
      p3,
      hex: srgb2hex(rgb),
      css: srgb2hex(rgb),
      within_sRGB: true,
      within_P3: true,
      within_Rec2020: true,
    }
  }

  return { name, ranges, hex2color, lch2color }
}
