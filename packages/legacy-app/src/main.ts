import { render, type RenderOptions } from '@openfanqie/core'

type LegacyRenderer = (dsl: string, options?: RenderOptions) => string

declare global {
  interface Window {
    resolveOpenFanqieRenderer: (renderer: LegacyRenderer) => void
  }
}

const decodeLegacyNewlines = (value: string): string => value.replaceAll('&hh&', '\n')

const renderLegacyRequest: LegacyRenderer = (dsl, options = {}) =>
  render(decodeLegacyNewlines(dsl), options)

window.resolveOpenFanqieRenderer(renderLegacyRequest)
