import { describe, expect, it } from 'vitest'
import { extractImeis, hasValidImeiChecksum } from './imei-photo'
describe('IMEI photo extraction', () => {
 it('reads two labelled IMEIs and ignores serials', () => {
  expect(extractImeis('IMEI\nIMEI1: 357094993666520\nIMEI2: 357094995337609\nPSN: 147404058V008931')).toEqual({imei1:'357094993666520',imei2:'357094995337609',unlabelled:false})
 })
 it('keeps IMEI 2 in the second slot when IMEI 1 is missing', () => {
  expect(extractImeis('IMEI2\n356938035643809')).toEqual({imei1:'',imei2:'356938035643809',unlabelled:false})
 })
 it('accepts grouped digits without inventing OCR corrections', () => {
  expect(extractImeis('IMEI 1: 49 015420 323751 8').imei1).toBe('490154203237518')
  expect(extractImeis('IMEI 1: 49O154203237518').imei1).toBe('')
 })
 it('does not truncate long identifiers or accept serial numbers', () => {
  expect(extractImeis('1234567890123456\nPSN: 123456789012345\nEID: 12345678901234567890123456789012')).toEqual({imei1:'',imei2:'',unlabelled:false})
 })
 it('flags unlabelled candidates and deduplicates repeated numbers', () => {
  expect(extractImeis('490154203237518\n490154203237518')).toEqual({imei1:'490154203237518',imei2:'',unlabelled:true})
 })
 it('checks digits without changing them', () => {
  expect(hasValidImeiChecksum('490154203237518')).toBe(true)
  expect(hasValidImeiChecksum('490154203237519')).toBe(false)
 })
})
