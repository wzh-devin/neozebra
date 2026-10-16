package controller

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"path"
	"strings"

	"github.com/neozebra/assets/vault/apperror"
	"github.com/neozebra/assets/vault/dto"
)

func IsPreviewPathAllowed(resource, key string) bool {
	if resource == "" || strings.ContainsAny(resource, "%\\") || strings.HasPrefix(resource, "/") || path.Clean(resource) != resource {
		return false
	}
	if strings.HasPrefix(resource, key) {
		return true
	}
	root := strings.Split(resource, "/")[0]
	switch root {
	case "js", "css", "images", "fonts", "bootstrap", "bootstrap-table", "excel", "xlsx", "xspreadsheet", "pdfjs", "pptx", "ofd", "epub", "eml", "msg", "xmind", "drawio", "bpmn", "tif", "dcm", "highlight", "ckplayer":
		return strings.Contains(resource, "/")
	}
	return resource == "onlinePreview" || resource == "getCorsFile"
}

func (a *Controller) previewProxy(w http.ResponseWriter, r *http.Request) error {
	p, entry, e := a.Service.ResolvePreviewTicket(r.Context(), "viewer", r.PathValue("ticket"))
	if e != nil {
		return e
	}
	resource := r.PathValue("path")
	if !IsPreviewPathAllowed(resource, p.CacheKey) {
		return apperror.New(404, "NOT_FOUND", "预览资源不存在")
	}
	if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
		return apperror.New(405, "METHOD_NOT_ALLOWED", "此预览只允许读取")
	}
	w.Header().Set("Access-Control-Allow-Origin", "null")
	w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Range")
	w.Header().Set("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range")
	w.Header().Set("Referrer-Policy", "no-referrer")
	if r.Method == "OPTIONS" {
		w.WriteHeader(204)
		return nil
	}

	// getCorsFile 永远读取当前文件，不接受浏览器提供的任意 URL。
	if resource == "getCorsFile" {
		return a.serveContent(w, r, entry)
	}
	target, e := url.Parse(a.Config.PreviewURL)
	if e != nil {
		return e
	}
	base := a.Config.Origin + dto.Prefix + "/viewer/" + r.PathValue("ticket") + "/"
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.Director = func(request *http.Request) {
		request.URL.Scheme = target.Scheme
		request.URL.Host = target.Host
		request.Host = target.Host
		request.URL.Path = "/" + resource
		request.URL.RawPath = ""
		request.Header.Del("Cookie")
		request.Header.Del("Authorization")
		request.Header.Set("X-Base-Url", base)
		request.Header.Del("X-Forwarded-Host")
		request.Header.Del("X-Forwarded-For")
		if resource == "onlinePreview" {
			engine, _ := url.Parse(a.Service.PreviewEngineURL(p))
			request.URL.RawQuery = engine.RawQuery
		}
	}
	proxy.ModifyResponse = func(response *http.Response) error {
		response.Header.Del("Set-Cookie")
		response.Header.Set("Cache-Control", "no-store")
		response.Header.Set("Access-Control-Allow-Origin", "null")
		response.Header.Set("Content-Security-Policy", "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob:; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; form-action 'none'; base-uri 'none'")
		if strings.Contains(response.Header.Get("Content-Type"), "text/html") {
			raw, e := io.ReadAll(io.LimitReader(response.Body, (4<<20)+1))
			response.Body.Close()
			if e != nil {
				return e
			}
			if len(raw) > 4<<20 {
				return apperror.New(413, "PREVIEW_LIMIT", "预览页面过大，请下载查看")
			}
			html := strings.ReplaceAll(string(raw), a.Service.PreviewSourceURL(p), base+"getCorsFile")
			origin, _ := json.Marshal(a.Config.Origin)
			bridge := `<script>document.addEventListener('DOMContentLoaded',()=>parent.postMessage({type:'vault-preview-ready'},` + string(origin) + `));document.addEventListener('keydown',e=>{if(e.key==='Escape')parent.postMessage({type:'vault-preview-close'},` + string(origin) + `)});</script>`
			html = strings.Replace(html, "</head>", `<style>html,body{margin:0;font-family:system-ui,sans-serif} .watermark,.watermark-container{display:none!important}</style>`+bridge+"</head>", 1)
			response.Body = io.NopCloser(bytes.NewBufferString(html))
			response.ContentLength = int64(len(html))
			response.Header.Del("Content-Length")
		}
		return nil
	}
	proxy.ErrorHandler = func(writer http.ResponseWriter, _ *http.Request, _ error) {
		respond(writer, 502, map[string]any{"error": map[string]string{"code": "PREVIEW_UNAVAILABLE", "message": "预览服务暂时不可用"}})
	}
	proxy.ServeHTTP(w, r)
	return nil
}
