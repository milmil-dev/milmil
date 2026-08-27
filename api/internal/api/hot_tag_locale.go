package api

import "github.com/milmil/api/internal/search"

// Bangumi's tag vocabulary is Traditional Chinese (see migration 000022), so
// an English, Japanese or Korean UI ends up rendering a row of Chinese words
// right next to its translated genre chips. These are the display names for
// the seeded vocabulary; anything outside it — a studio name, a per-title
// Bangumi tag — falls back to the tag itself, which is also what the client
// keeps sending back as the search term.
type tagNames struct{ en, ja, ko string }

var hotTagNames = map[string]tagNames{
	// Source
	"原創":    {"Original", "オリジナル", "오리지널"},
	"漫畫改編":  {"Manga Adaptation", "漫画原作", "만화 원작"},
	"小說改編":  {"Novel Adaptation", "小説原作", "소설 원작"},
	"遊戲改編":  {"Game Adaptation", "ゲーム原作", "게임 원작"},
	"輕小說改編": {"Light Novel Adaptation", "ラノベ原作", "라이트노벨 원작"},
	// Mood
	"日常": {"Slice of Life", "日常", "일상"},
	"搞笑": {"Comedy", "ギャグ", "개그"},
	"治癒": {"Healing", "癒し", "힐링"},
	"催淚": {"Tearjerker", "泣ける", "눈물"},
	"致鬱": {"Depressing", "鬱アニメ", "우울물"},
	"熱血": {"Hot-Blooded", "熱血", "열혈"},
	"勵志": {"Inspirational", "努力・成長", "성장물"},
	// Genre
	"戀愛": {"Romance", "恋愛", "로맨스"},
	"後宮": {"Harem", "ハーレム", "하렘"},
	"百合": {"Yuri", "百合", "백합"},
	"耽美": {"Boys' Love", "ボーイズラブ", "BL"},
	"戰鬥": {"Battle", "バトル", "배틀"},
	"冒險": {"Adventure", "冒険", "모험"},
	"推理": {"Detective", "推理", "추리"},
	"懸疑": {"Mystery", "ミステリー", "미스터리"},
	"恐怖": {"Horror", "ホラー", "호러"},
	"科幻": {"Sci-Fi", "SF", "SF"},
	"奇幻": {"Fantasy", "ファンタジー", "판타지"},
	"機戰": {"Mecha", "ロボット", "메카"},
	"魔法": {"Magic", "魔法", "마법"},
	"運動": {"Sports", "スポーツ", "스포츠"},
	"音樂": {"Music", "音楽", "음악"},
	"偶像": {"Idol", "アイドル", "아이돌"},
	"美食": {"Food", "グルメ", "미식"},
	// Setting
	"異世界": {"Isekai", "異世界", "이세계"},
	"穿越":  {"Time Slip", "タイムスリップ", "타임슬립"},
	"轉生":  {"Reincarnation", "転生", "전생"},
	"校園":  {"School", "学園", "학원"},
	"青春":  {"Youth", "青春", "청춘"},
	"職場":  {"Workplace", "お仕事", "직장"},
	"歷史":  {"Historical", "歴史", "역사"},
	"軍事":  {"Military", "ミリタリー", "밀리터리"},
	"宇宙":  {"Space", "宇宙", "우주"},
	// Style
	"黑暗":   {"Dark", "ダーク", "다크"},
	"群像劇":  {"Ensemble Cast", "群像劇", "군상극"},
	"社會派":  {"Social Drama", "社会派", "사회파"},
	"賽博朋克": {"Cyberpunk", "サイバーパンク", "사이버펑크"},
	// Studio — the Latin-script ones (MAPPA, BONES, …) read the same everywhere
	"JUMP系": {"Shonen Jump", "ジャンプ系", "점프 계열"},
	"芳文社":   {"Houbunsha", "芳文社", "호분샤"},
	"京都動畫":  {"Kyoto Animation", "京都アニメーション", "교토 애니메이션"},
	// Activity
	"旅行": {"Travel", "旅", "여행"},
	"釣魚": {"Fishing", "釣り", "낚시"},
	"露營": {"Camping", "キャンプ", "캠핑"},
	"料理": {"Cooking", "料理", "요리"},
	// Misc
	"龍傲天":  {"Overpowered Hero", "俺TUEEE", "먼치킨"},
	"女性向":  {"Josei", "女性向け", "여성향"},
	"子供向":  {"Kids", "子供向け", "아동용"},
	"深夜動畫": {"Late-Night Anime", "深夜アニメ", "심야 애니"},
	"劇場版":  {"Movie", "劇場版", "극장판"},
	"短篇":   {"Short", "ショートアニメ", "단편"},
	"續篇":   {"Sequel", "続編", "속편"},
	"聲優":   {"Voice Cast", "声優", "성우"},
}

// localizeTag renders a tag for the caller's UI language. The tag itself stays
// the identity used for searching, so this only ever feeds a `display` field.
func localizeTag(name, locale string) string {
	var display string
	switch locale {
	case "zh-CN":
		return search.ToSimplified(name)
	case "en-US":
		display = hotTagNames[name].en
	case "ja-JP":
		display = hotTagNames[name].ja
	case "ko-KR":
		display = hotTagNames[name].ko
	}
	if display == "" {
		return name
	}
	return display
}
