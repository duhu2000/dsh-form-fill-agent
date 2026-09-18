export const CORE_FIELDS = Object.freeze([
  {
    "key": "province",
    "label": "省份",
    "sourcePath": "地区信息.省份",
    "aliases": [
      "省",
      "所属省份"
    ],
    "type": "string",
    "defaultSelected": false,
    "selectionNote": "仅使用来源明确返回的字段；缺失层级留空，不推测。"
  },
  {
    "key": "city",
    "label": "城市",
    "sourcePath": "地区信息.城市",
    "aliases": [
      "市",
      "所属城市"
    ],
    "type": "string",
    "defaultSelected": false,
    "selectionNote": "仅使用来源明确返回的字段；缺失层级留空，不推测。"
  },
  {
    "key": "district",
    "label": "区域",
    "sourcePath": "地区信息.区域",
    "aliases": [
      "区县",
      "所属区县"
    ],
    "type": "string",
    "defaultSelected": false,
    "selectionNote": "仅使用来源明确返回的字段；缺失层级留空，不推测。"
  },
  {
    "key": "area_code",
    "label": "地区代码",
    "sourcePath": "地区信息.地区代码",
    "aliases": [
      "行政区划代码"
    ],
    "type": "string",
    "defaultSelected": false,
    "selectionNote": "仅使用来源明确返回的字段；缺失层级留空，不推测。"
  },
  {
    "key": "industry_section",
    "label": "国标行业门类",
    "sourcePath": "国标行业.门类",
    "aliases": [
      "国标行业一级"
    ],
    "type": "string",
    "defaultSelected": false,
    "selectionNote": "仅使用来源明确返回的字段；缺失层级留空，不推测。"
  },
  {
    "key": "industry_large",
    "label": "国标行业大类",
    "sourcePath": "国标行业.大类",
    "aliases": [
      "国标行业二级"
    ],
    "type": "string",
    "defaultSelected": false,
    "selectionNote": "仅使用来源明确返回的字段；缺失层级留空，不推测。"
  },
  {
    "key": "industry_middle",
    "label": "国标行业中类",
    "sourcePath": "国标行业.中类",
    "aliases": [
      "国标行业三级"
    ],
    "type": "string",
    "defaultSelected": false,
    "selectionNote": "仅使用来源明确返回的字段；缺失层级留空，不推测。"
  },
  {
    "key": "industry_small",
    "label": "国标行业小类",
    "sourcePath": "国标行业.小类",
    "aliases": [
      "国标行业四级"
    ],
    "type": "string",
    "defaultSelected": false,
    "selectionNote": "仅使用来源明确返回的字段；缺失层级留空，不推测。"
  },
  {
    "key": "qcc_industry_level1",
    "label": "企查查行业一级",
    "sourcePath": "企查查行业.一级",
    "aliases": [
      "企查查一级行业"
    ],
    "type": "string",
    "defaultSelected": false,
    "selectionNote": "仅使用来源明确返回的字段；缺失层级留空，不推测。"
  },
  {
    "key": "qcc_industry_level2",
    "label": "企查查行业二级",
    "sourcePath": "企查查行业.二级",
    "aliases": [
      "企查查二级行业"
    ],
    "type": "string",
    "defaultSelected": false,
    "selectionNote": "仅使用来源明确返回的字段；缺失层级留空，不推测。"
  },
  {
    "key": "qcc_industry_level3",
    "label": "企查查行业三级",
    "sourcePath": "企查查行业.三级",
    "aliases": [
      "企查查三级行业"
    ],
    "type": "string",
    "defaultSelected": false,
    "selectionNote": "仅使用来源明确返回的字段；缺失层级留空，不推测。"
  },
  {
    "key": "qcc_industry_level4",
    "label": "企查查行业四级",
    "sourcePath": "企查查行业.四级",
    "aliases": [
      "企查查四级行业"
    ],
    "type": "string",
    "defaultSelected": false,
    "selectionNote": "仅使用来源明确返回的字段；缺失层级留空，不推测。"
  },
  {
    "key": "main_products",
    "label": "主营产品",
    "sourcePath": "主营产品",
    "aliases": [
      "主要产品"
    ],
    "type": "string",
    "defaultSelected": false,
    "selectionNote": "主营产品按源顺序合并一格；上游最多返回10项，非完整产品库。"
  },
  {
    "key": "company_scale",
    "label": "企业规模",
    "sourcePath": "企业规模",
    "aliases": [
      "企业规模分类"
    ],
    "type": "string",
    "defaultSelected": false,
    "selectionNote": "企业规模与人员规模独立，不可互换。"
  }
]);
export const REGISTRATION_CORE_FIELDS = CORE_FIELDS.slice(0,8);
export const PROFILE_CORE_FIELDS = CORE_FIELDS.slice(8);
export function coreFieldText(value){return typeof value === "string" || typeof value === "number" && Number.isFinite(value) ? String(value) : "";}
export function industryDisplay(value,levels){if(!value || typeof value!=="object" || Array.isArray(value))return coreFieldText(value);return levels.map(level=>{const text=coreFieldText(value[level]);return text.trim()?level+"："+text:""}).filter(Boolean).join("；");}
export function projectCoreField(data,field){const value=field.sourcePath.split(".").reduce((v,k)=>v?.[k],data);return field.key==="main_products" && Array.isArray(value)?value.filter(v=>typeof v==="string"&&v.trim()).join("；"):coreFieldText(value);}
