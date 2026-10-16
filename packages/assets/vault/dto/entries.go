package dto

import (
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/neozebra/assets/vault/apperror"
	"github.com/neozebra/assets/vault/model"
)

func ValidateName(name string) error {
	if name != strings.TrimSpace(name) || name == "" || name == "." || name == ".." || !utf8.ValidString(name) || len(name) > 255 || strings.ContainsAny(name, "/\\") {
		return apperror.New(400, "INVALID_NAME", "名称不能为空，不能包含路径分隔符，且不超过 255 字节")
	}
	for _, r := range name {
		if unicode.IsControl(r) {
			return apperror.New(400, "INVALID_NAME", "名称包含无效字符")
		}
	}
	return nil
}

func ParseID(value string) (int64, error) {
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id < 0 {
		return 0, apperror.New(400, "INVALID_ID", "条目编号无效")
	}
	return id, nil
}

type CreateFolder struct {
	Name     string `json:"name"`
	ParentID string `json:"parentId"`
	Reuse    bool   `json:"reuse"`
}
type EditEntry struct {
	Name     *string `json:"name"`
	ParentID *string `json:"parentId"`
}
type RestoreEntry struct {
	ParentID *string `json:"parentId"`
}
type EmptyTrash struct {
	Confirm bool `json:"confirm"`
}
type EntryQuery struct {
	ParentID int64
	Trash    bool
	Search   string
	Limit    int
	Cursor   string
}
type EntryPage struct {
	Entries    []model.Entry `json:"entries"`
	Path       []model.Entry `json:"path"`
	NextCursor string        `json:"nextCursor"`
	Revision   string        `json:"revision"`
}
