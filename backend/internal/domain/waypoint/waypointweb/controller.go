package waypointweb

import (
	"context"
	"fmt"
	"net/http"

	"github.com/antoniosarro/saint-tracker/backend/internal/domain/waypoint"
	"github.com/antoniosarro/saint-tracker/backend/internal/sdk/httperrors"
	"github.com/antoniosarro/saint-tracker/backend/internal/sdk/validate"
	"github.com/antoniosarro/saint-tracker/backend/pkg/logger"
	"github.com/labstack/echo/v4"
)

type iUseCase interface {
	GetList(ctx context.Context) ([]*waypoint.WaypointDTO, error)
	Register(ctx context.Context, w *waypoint.NewWaypointDTO) (*waypoint.WaypointDTO, error)
}

type controller struct {
	waypointUC iUseCase
	log        *logger.Log
}

func newController(waypointUC iUseCase, log *logger.Log) *controller {
	return &controller{waypointUC, log}
}

func (con *controller) list(c echo.Context) error {
	w, err := con.waypointUC.GetList(c.Request().Context())
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, w)
}

func (con *controller) register(c echo.Context) error {
	dto := new(waypoint.NewWaypointDTO)

	if err := c.Bind(dto); err != nil {
		return httperrors.New(httperrors.InvalidArgument, "Invalid JSON body")
	}

	if err := dto.Validate(); err != nil {
		fmt.Println(err)
		e := httperrors.New(httperrors.InvalidArgument, "Invalid JSON body")
		validateErrs := validate.SplitErrors(err)
		for _, s := range validateErrs {
			e.AddDetail(s)
		}
		return e
	}

	w, err := con.waypointUC.Register(c.Request().Context(), dto)
	if err != nil {
		return err
	}

	return c.JSON(http.StatusCreated, w)
}
