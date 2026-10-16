package dto

import (
	"net/url"
	"strconv"
	"strings"

	"github.com/neozebra/assets/vault/apperror"
)

func ParseEntryQuery(values url.Values) (EntryQuery, error) {
	parent, err := ParseID(values.Get("parentId"))
	if values.Get("parentId") == "" {
		parent = 0
		err = nil
	}
	if err != nil {
		return EntryQuery{}, err
	}
	trash := values.Get("trash") == "true"
	search := strings.TrimSpace(values.Get("search"))
	if len(search) > 255 {
		return EntryQuery{}, apperror.New(400, "INVALID_INPUT", "搜索条件过长")
	}
	limit := 100
	if raw := values.Get("limit"); raw != "" {
		limit, err = strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > 100 {
			return EntryQuery{}, apperror.New(400, "INVALID_INPUT", "每页数量必须为 1–100")
		}
	}
	return EntryQuery{ParentID: parent, Trash: trash, Search: search, Limit: limit, Cursor: values.Get("cursor")}, nil
}
