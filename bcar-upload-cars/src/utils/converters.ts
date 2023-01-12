
import { ManufacturerOrigin } from "../types"

export const categoryConvertor = new Map<string, string>([
  ["", "중대형"], // 카테고리가 없는 차량은 중대형으로 그냥 넣어버린다.
  ["대형차", "중대형"],
  ["중형차", "중대형"],
  ["경차", "경소형"],
  ["소형차", "경소형"],
  ["준중형차", "준중형"],
  ["승합차", "승합"],
  ["화물차", "화물/버스"],
  ["버스", "화물/버스"],
  ["특장차", "화물/버스"],
  ["RV", "SUV/RV"],
  ["SUV", "SUV/RV"],
  ["스포츠카", "스포츠카"],
])

export const companyConvertor = new Map<string, {name: string,origin: ManufacturerOrigin}>([
  // 기본차량 - 국내
  ["기아", {name: "기아", origin: ManufacturerOrigin.Domestic}],
  ["현대", {name: "현대", origin: ManufacturerOrigin.Domestic}],
  ["쌍용", {name: "쌍용", origin: ManufacturerOrigin.Domestic}],
  ["삼성", {name: "삼성", origin: ManufacturerOrigin.Domestic}],
  ["쉐보레(대우)", {name: "쉐보레(대우)", origin: ManufacturerOrigin.Domestic}],
  // 기본차량 - 수입
  ["렉서스", {name: "렉서스", origin: ManufacturerOrigin.Imported}],
  ["벤츠", {name: "벤츠", origin: ManufacturerOrigin.Imported}],
  ["아우디", {name: "아우디", origin: ManufacturerOrigin.Imported}],
  ["미니", {name: "미니", origin: ManufacturerOrigin.Imported}],
  ["테슬라", {name: "테슬라", origin: ManufacturerOrigin.Imported}],
  ["포드", {name: "포드", origin: ManufacturerOrigin.Imported}],
  ["캐딜락", {name: "캐딜락", origin: ManufacturerOrigin.Imported}],
  ["푸조", {name: "푸조", origin: ManufacturerOrigin.Imported}],
  ["지프", {name: "지프", origin: ManufacturerOrigin.Imported}],
  ["포르쉐", {name: "포르쉐", origin: ManufacturerOrigin.Imported}],
  ["혼다", {name: "혼다", origin: ManufacturerOrigin.Imported}],
  ["링컨", {name: "링컨", origin: ManufacturerOrigin.Imported}],
  ["도요타", {name: "도요타", origin: ManufacturerOrigin.Imported}],
  ["벤틀리", {name: "벤틀리", origin: ManufacturerOrigin.Imported}],
  ["BMW", {name: "BMW", origin: ManufacturerOrigin.Imported}],
  ["크라이슬러", {name: "크라이슬러", origin: ManufacturerOrigin.Imported}],
  ["랜드로버", {name: "랜드로버", origin: ManufacturerOrigin.Imported}],
  ["닛산", {name: "닛산", origin: ManufacturerOrigin.Imported}],
  ["볼보", {name: "볼보", origin: ManufacturerOrigin.Imported}],
  ["폭스바겐", {name: "폭스바겐", origin: ManufacturerOrigin.Imported}],
  ["인피니티", {name: "인피니티", origin: ManufacturerOrigin.Imported}],
  // 추가차량 - 국내
  ["르노(삼성)", {name: "삼성", origin: ManufacturerOrigin.Domestic}],
  ["쉐보레", {name: "쉐보레(대우)", origin: ManufacturerOrigin.Domestic}],
  ["대창모터스", {name: "기타", origin: ManufacturerOrigin.Domestic}],
  ["대우버스", {name: "기타", origin: ManufacturerOrigin.Domestic}],
  ["세보모빌리티(캠시스)", {name: "기타", origin: ManufacturerOrigin.Domestic}],
  ["한국상용트럭", {name: "기타", origin: ManufacturerOrigin.Domestic}],
  // 추가차량 - 수입
  ["토요타", {name: "도요타", origin: ManufacturerOrigin.Imported}],
  ["재규어", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["시트로엥", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["미쯔비시", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["피아트", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["북기은상", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["다이하쯔", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["스마트", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["타타대우", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["스바루", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["마세라티", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["스즈키", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["사브", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["닷지", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["쯔더우(쎄미시스코)", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["DFSK(동풍자동차)", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["만트럭", {name: "기타", origin: ManufacturerOrigin.Imported}],
  ["포톤", {name: "기타", origin: ManufacturerOrigin.Imported}],
])

export const modelDetailConverter = new Map<string, string>([
  ["봉고III", "봉고Ⅲ"],
  ["더뉴봉고III", "더 뉴봉고Ⅲ"],
  ["봉고IIIEV", "봉고ⅢEV"],
  ["올뉴모닝JA", "올뉴모닝(JA)"],
  ["캡처", "캡쳐"],
])

