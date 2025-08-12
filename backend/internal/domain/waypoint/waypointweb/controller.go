package waypointweb

import (
	"context"
	"encoding/json"
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
	Register(ctx context.Context, wcs []*waypoint.NewWaypointDTO) ([]*waypoint.WaypointDTO, error)
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
	var body json.RawMessage
	if err := c.Bind(&body); err != nil {
		return httperrors.New(httperrors.InvalidArgument, "Invalid JSON body")
	}

	// Try to parse as array first
	var dtoArray []*waypoint.NewWaypointDTO
	var dtos []*waypoint.NewWaypointDTO

	// Check if it's an array by trying to unmarshal as array
	if err := json.Unmarshal(body, &dtoArray); err == nil && len(dtoArray) > 0 {
		// It's an array
		dtos = dtoArray
	} else {
		// Try as single object
		dto := new(waypoint.NewWaypointDTO)
		if err := json.Unmarshal(body, dto); err != nil {
			return httperrors.New(httperrors.InvalidArgument, "Invalid JSON body")
		}
		dtos = []*waypoint.NewWaypointDTO{dto}
	}

	// Validate all DTOs
	for i, dto := range dtos {
		if err := dto.Validate(); err != nil {
			fmt.Printf("Validation error for item %d: %v\n", i, err)
			e := httperrors.New(httperrors.InvalidArgument, fmt.Sprintf("Invalid JSON body for item %d", i))
			validateErrs := validate.SplitErrors(err)
			for _, s := range validateErrs {
				e.AddDetail(fmt.Sprintf("Item %d: %s", i, s))
			}
			return e
		}
	}

	// Register all waypoints
	waypoints, err := con.waypointUC.Register(c.Request().Context(), dtos)
	if err != nil {
		return err
	}

	// Return appropriate response based on input type
	if len(waypoints) == 1 && len(dtoArray) == 0 {
		// Single item was sent, return single item
		return c.JSON(http.StatusCreated, waypoints[0])
	} else {
		// Array was sent, return array
		return c.JSON(http.StatusCreated, waypoints)
	}
}
