# AGENTS.md（shift-craft-salon-）

このリポジトリで作業するすべての AI（Claude Code・Codex など）が最初に読む決まり。**ルールの正本はこのファイル**（2026-11-16 にそろえた。それまでは固有の決まりは無かった）。
`CLAUDE.md` は、このファイルを読み込むだけの入口。ルールを直すときは、このファイルを直す。

<!-- manager-ai:begin -->
## 共通のマネージャAIスキル

作業開始時に、利用する環境の指示書を全文読んでください。

- Codex: `.agents/skills/manager-ai/SKILL.md`
- Claude Code: `.claude/skills/manager-ai/SKILL.md`

依頼の目的・完了条件・許可範囲を確認し、既存の担当分担・保存先・作業規則と併せて使います。同じ成果物を複数担当が同時に更新せず、担当の報告と実物の検収を分けて記録してください。利用者の最新の訂正・保留を優先します。

共通原本と照合用SHA256は `.ai/manager-ai-source.json` に記録しています。このスキルは操作ツールや認証を追加しません。実際に使える機能と利用者の許可を確認して運用してください。
<!-- manager-ai:end -->
