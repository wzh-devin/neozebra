package apperror

type APIError struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Retryable bool   `json:"retryable"`
	Status    int    `json:"-"`
}

func (e *APIError) Error() string { return e.Code }

func New(status int, code, message string) error {
	return &APIError{Code: code, Message: message, Status: status, Retryable: status >= 500 || status == 429}
}
