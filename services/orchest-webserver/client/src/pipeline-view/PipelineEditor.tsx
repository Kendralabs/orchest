import { IconButton } from "@/components/common/IconButton";
import { useAppContext } from "@/contexts/AppContext";
import { useCustomRoute } from "@/hooks/useCustomRoute";
import { useHasChanged } from "@/hooks/useHasChanged";
import { useHotKeys } from "@/hooks/useHotKeys";
import type {
  Connection,
  PipelineJson,
  PipelineRun,
  Step,
  StepsDict,
} from "@/types";
import { getHeight, getOffset, getWidth } from "@/utils/jquery-replacement";
import { layoutPipeline } from "@/utils/pipeline-layout";
import { resolve } from "@/utils/resolve";
import {
  filterServices,
  getScrollLineHeight,
  validatePipeline,
} from "@/utils/webserver-utils";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import CropFreeIcon from "@mui/icons-material/CropFree";
import DeleteIcon from "@mui/icons-material/Delete";
import RemoveIcon from "@mui/icons-material/Remove";
import SettingsIcon from "@mui/icons-material/Settings";
import TuneIcon from "@mui/icons-material/Tune";
import ViewHeadlineIcon from "@mui/icons-material/ViewHeadline";
import VisibilityIcon from "@mui/icons-material/Visibility";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import {
  activeElementIsInput,
  collapseDoubleDots,
  fetcher,
  hasValue,
  HEADER,
  uuidv4,
} from "@orchest/lib-utils";
import React from "react";
import { siteMap } from "../Routes";
import { BackToJobButton } from "./BackToJobButton";
import {
  getNodeCenter,
  getScaleCorrectedPosition,
  PIPELINE_JOBS_STATUS_ENDPOINT,
  PIPELINE_RUN_STATUS_ENDPOINT,
  scaleCorrected,
  updatePipelineJson,
} from "./common";
import { ConnectionDot } from "./ConnectionDot";
import { usePipelineEditorContext } from "./contexts/PipelineEditorContext";
import {
  INITIAL_PIPELINE_POSITION,
  usePipelineViewState,
} from "./hooks/usePipelineViewState";
import { useSavingIndicator } from "./hooks/useSavingIndicator";
import {
  convertStepsToObject,
  useStepExecutionState,
} from "./hooks/useStepExecutionState";
import { PipelineCanvas } from "./PipelineCanvas";
import { PipelineConnection } from "./PipelineConnection";
import {
  getStateText,
  PipelineStep,
  StepStatus,
  STEP_HEIGHT,
  STEP_WIDTH,
} from "./PipelineStep";
import { PipelineViewport } from "./PipelineViewport";
import { getStepSelectorRectangle, Rectangle } from "./Rectangle";
import { ServicesMenu } from "./ServicesMenu";
import { StepDetails } from "./step-details/StepDetails";

const DEFAULT_SCALE_FACTOR = 1;

type RunStepsType = "selection" | "incoming";

const originTransformScaling = (
  origin: [number, number],
  scaleFactor: number
) => {
  /* By multiplying the transform-origin with the scaleFactor we get the right
   * displacement for the transformed/scaled parent (pipelineStepHolder)
   * that avoids visual displacement when the origin of the
   * transformed/scaled parent is modified.
   *
   * the adjustedScaleFactor was derived by analyzing the geometric behavior
   * of applying the css transform: translate(...) scale(...);.
   */

  let adjustedScaleFactor = scaleFactor - 1;
  origin[0] *= adjustedScaleFactor;
  origin[1] *= adjustedScaleFactor;
  return origin;
};

export const PipelineEditor: React.FC = () => {
  const { setAlert, setConfirm } = useAppContext();

  const { projectUuid, pipelineUuid, jobUuid, navigateTo } = useCustomRoute();

  const returnToJob = React.useCallback(
    (e?: React.MouseEvent) => {
      navigateTo(
        siteMap.job.path,
        {
          query: { projectUuid, jobUuid },
        },
        e
      );
    },
    [projectUuid, jobUuid, navigateTo]
  );

  const [panningState, setPanningState] = React.useState<
    "ready-to-pan" | "panning" | "idle"
  >("idle");

  const {
    eventVars,
    dispatch,
    stepDomRefs,
    newConnection,
    keysDown,
    trackMouseMovement,
    mouseTracker,
    pipelineCwd,
    pipelineJson,
    environments,
    setPipelineJson,
    hash,
    fetchDataError,
    runUuid,
    setRunUuid,
    zIndexMax,
    isReadOnly,
    instantiateConnection,
    metadataPositions,
    session,
  } = usePipelineEditorContext();

  const removeSteps = React.useCallback(
    (uuids: string[]) => {
      dispatch({ type: "REMOVE_STEPS", payload: uuids });
    },
    [dispatch]
  );

  const isJobRun = jobUuid && runUuid;
  const jobRunQueryArgs = { jobUuid, runUuid };

  const pipelineViewportRef = React.useRef<HTMLDivElement>();
  const pipelineCanvasRef = React.useRef<HTMLDivElement>();

  const canvasOffset = getOffset(pipelineCanvasRef.current);
  const getPosition = getNodeCenter(canvasOffset, eventVars.scaleFactor);

  const [isHoverEditor, setIsHoverEditor] = React.useState(false);
  const { setScope } = useHotKeys(
    {
      "pipeline-editor": {
        "ctrl+a, command+a, ctrl+enter, command+enter": (e, hotKeyEvent) => {
          if (["ctrl+a", "command+a"].includes(hotKeyEvent.key)) {
            e.preventDefault();

            dispatch({
              type: "SELECT_STEPS",
              payload: { uuids: Object.keys(eventVars.steps) },
            });
          }
          if (["ctrl+enter", "command+enter"].includes(hotKeyEvent.key))
            runSelectedSteps();
        },
      },
    },
    [isHoverEditor],
    isHoverEditor
  );

  const [isDeletingSteps, setIsDeletingSteps] = React.useState(false);
  const [pendingRuns, setPendingRuns] = React.useState<
    { uuids: string[]; type: RunStepsType } | undefined
  >();

  const [pipelineRunning, setPipelineRunning] = React.useState(false);
  const [isCancellingRun, setIsCancellingRun] = React.useState(false);

  React.useEffect(() => {
    // This case is hit when a user tries to load a pipeline that belongs
    // to a run that has not started yet. The project files are only
    // copied when the run starts. Before start, the pipeline.json thus
    // cannot be found. Alert the user about missing pipeline and return
    // to JobView.
    if (fetchDataError)
      setAlert(
        "Error",
        jobUuid
          ? "The .orchest pipeline file could not be found. This pipeline run has not been started. Returning to Job view."
          : "Could not load pipeline",
        (resolve) => {
          resolve(true);
          returnToJob();

          return true;
        }
      );
  }, [fetchDataError, returnToJob, setAlert, jobUuid]);

  const runStatusEndpoint = jobUuid
    ? `${PIPELINE_JOBS_STATUS_ENDPOINT}/${jobUuid}`
    : PIPELINE_RUN_STATUS_ENDPOINT;

  const { stepExecutionState, setStepExecutionState } = useStepExecutionState(
    runUuid ? `${runStatusEndpoint}/${runUuid}` : null,
    (runStatus) => {
      if (["PENDING", "STARTED"].includes(runStatus)) {
        setPipelineRunning(true);
      }

      if (["SUCCESS", "ABORTED", "FAILURE"].includes(runStatus)) {
        // make sure stale opened files are reloaded in active
        // Jupyter instance

        if (window.orchest.jupyter)
          window.orchest.jupyter.reloadFilesFromDisk();

        setPipelineRunning(false);
        setIsCancellingRun(false);
      }
    }
  );

  const setOngoingSaves = useSavingIndicator();
  const [state, setState] = usePipelineViewState();

  const executePipelineSteps = React.useCallback(
    async (uuids: string[], type: RunStepsType) => {
      try {
        const result = await fetcher<PipelineRun>(
          `${PIPELINE_RUN_STATUS_ENDPOINT}/`, // NOTE: trailing back slash is required
          {
            method: "POST",
            headers: HEADER.JSON,
            body: JSON.stringify({
              uuids: uuids,
              project_uuid: projectUuid,
              run_type: type,
              pipeline_definition: pipelineJson,
            }),
          }
        );

        setStepExecutionState((current) => ({
          ...current,
          ...convertStepsToObject(result),
        }));
        setRunUuid(result.uuid);
        return true;
      } catch (error) {
        setAlert(
          "Error",
          `Failed to start interactive run. ${error.message || "Unknown error"}`
        );
        return false;
      }
    },
    [projectUuid, setStepExecutionState, setAlert, pipelineJson, setRunUuid]
  );

  const savePipelineJson = React.useCallback(
    async (data: PipelineJson) => {
      if (!data || isReadOnly) return;
      setOngoingSaves((current) => current + 1);

      let formData = new FormData();
      formData.append("pipeline_json", JSON.stringify(data));
      const response = await resolve(() =>
        fetcher(`/async/pipelines/json/${projectUuid}/${pipelineUuid}`, {
          method: "POST",
          body: formData,
        })
      );
      if (response.status === "rejected") {
        setAlert("Error", `Failed to save pipeline. ${response.error.message}`);
        return;
      }
      if (pendingRuns) {
        const { uuids, type } = pendingRuns;
        setPipelineRunning(true);
        const executionStarted = await executePipelineSteps(uuids, type);
        if (!executionStarted) setPipelineRunning(false);
        setPendingRuns(undefined);
      }

      setOngoingSaves((current) => current - 1);
    },
    [
      setPipelineRunning,
      setAlert,
      projectUuid,
      pipelineUuid,
      executePipelineSteps,
      pendingRuns,
      setOngoingSaves,
    ]
  );

  const savePipeline = React.useCallback(
    async (steps?: StepsDict) => {
      if (!pipelineJson) return;
      if (isReadOnly) {
        console.error("savePipeline should be uncallable in readOnly mode.");
        return;
      }

      const updatedPipelineJson = steps
        ? updatePipelineJson(pipelineJson, steps)
        : pipelineJson;

      // validate pipelineJSON
      let pipelineValidation = validatePipeline(updatedPipelineJson);

      if (!pipelineValidation.valid) {
        // Just show the first error
        setAlert("Error", pipelineValidation.errors[0]);
        return;
      }
      savePipelineJson(updatedPipelineJson);
    },
    [isReadOnly, savePipelineJson, setAlert, pipelineJson]
  );

  const onMouseUpPipelineStep = React.useCallback(
    (endNodeUUID: string) => {
      // finish creating connection
      dispatch({ type: "MAKE_CONNECTION", payload: endNodeUUID });
    },
    [dispatch]
  );

  React.useEffect(() => {
    if (eventVars.initialized) savePipeline(eventVars.steps);
  }, [savePipeline, eventVars.steps, eventVars.initialized]);

  const openSettings = (e: React.MouseEvent) => {
    navigateTo(
      siteMap.pipelineSettings.path,
      {
        query: {
          projectUuid,
          pipelineUuid,
          ...(isJobRun ? jobRunQueryArgs : undefined),
        },
        state: { isReadOnly },
      },
      e
    );
  };

  const openLogs = (e: React.MouseEvent) => {
    navigateTo(
      siteMap.logs.path,
      {
        query: {
          projectUuid,
          pipelineUuid,
          ...(isJobRun ? jobRunQueryArgs : undefined),
        },
        state: { isReadOnly },
      },
      e
    );
  };

  const onOpenFilePreviewView = (e: React.MouseEvent, stepUuid: string) => {
    navigateTo(
      siteMap.filePreview.path,
      {
        query: {
          projectUuid,
          pipelineUuid,
          stepUuid,
          ...(isJobRun ? jobRunQueryArgs : undefined),
        },
        state: { isReadOnly },
      },
      e
    );
  };

  const notebookFilePath = React.useCallback(
    (pipelineCwd: string, stepUUID: string) => {
      return collapseDoubleDots(
        `${pipelineCwd}${eventVars.steps[stepUUID].file_path}`
      ).slice(1);
    },
    [eventVars.steps]
  );

  const openNotebook = React.useCallback(
    (e: React.MouseEvent | undefined, filePath: string) => {
      if (session?.status === "RUNNING") {
        navigateTo(
          siteMap.jupyterLab.path,
          { query: { projectUuid, pipelineUuid, filePath } },
          e
        );
        return;
      }
      if (session?.status === "LAUNCHING") {
        setAlert(
          "Error",
          "Please wait for the session to start before opening the Notebook in Jupyter."
        );
        return;
      }

      setAlert(
        "Error",
        "Please start the session before opening the Notebook in Jupyter."
      );
    },
    [setAlert, session?.status, navigateTo, pipelineUuid, projectUuid]
  );

  const [isShowingServices, setIsShowingServices] = React.useState(false);

  const showServices = () => {
    setIsShowingServices(true);
  };

  const hideServices = () => {
    setIsShowingServices(false);
  };

  const removeConnection = React.useCallback(
    (connection: Connection) => {
      dispatch({ type: "REMOVE_CONNECTION", payload: connection });
      // if it's a aborted new connection, we don't need to save it
      if (connection.endNodeUUID) {
        savePipeline(eventVars.steps);
      }
    },
    [dispatch, savePipeline, eventVars.steps]
  );

  const createNextStep = async () => {
    if (!pipelineViewportRef.current) {
      console.error(
        "Unable to create next step. pipelineCanvas is not yet instantiated!"
      );
      return;
    }
    try {
      // Assume the first environment as the default
      // user can change it afterwards
      const environment = environments.length > 0 ? environments[0] : null;
      // When new steps are successively created then we don't want
      // them to be spawned on top of each other. NOTE: we use the
      // same offset for X and Y position.
      const { clientWidth, clientHeight } = pipelineViewportRef.current;
      const [pipelineOffsetX, pipelineOffsetY] = state.pipelineOffset;

      const position = [
        -pipelineOffsetX + clientWidth / 2 - STEP_WIDTH / 2,
        -pipelineOffsetY + clientHeight / 2 - STEP_HEIGHT / 2,
      ] as [number, number];

      dispatch({
        type: "CREATE_STEP",
        payload: {
          title: "",
          uuid: uuidv4(),
          incoming_connections: [],
          file_path: "",
          kernel: {
            name: environment?.language,
            display_name: environment?.name,
          },
          environment: environment?.uuid,
          parameters: {},
          meta_data: {
            position,
            hidden: false,
          },
        },
      });
      savePipeline(eventVars.steps);
    } catch (error) {
      setAlert("Error", `Unable to create a new step. ${error}`);
    }
  };

  const onDoubleClickStep = (stepUUID: string) => {
    if (isReadOnly) {
      onOpenFilePreviewView(undefined, stepUUID);
    } else {
      openNotebook(undefined, notebookFilePath(pipelineCwd, stepUUID));
    }
  };

  const deleteSelectedSteps = React.useCallback(() => {
    // The if is to avoid the dialog appearing when no steps are
    // selected and the delete button is pressed.
    if (eventVars.selectedSteps.length > 0) {
      setIsDeletingSteps(true);

      setConfirm(
        "Warning",
        `A deleted step and its logs cannot be recovered once deleted, are you sure you want to proceed?`,
        {
          onConfirm: async (resolve) => {
            dispatch({ type: "SET_OPENED_STEP", payload: undefined });
            removeSteps([...eventVars.selectedSteps]);
            setIsDeletingSteps(false);
            savePipeline(eventVars.steps);
            resolve(true);
            return true;
          },
          onCancel: (resolve) => {
            setIsDeletingSteps(false);
            resolve(false);
            return false;
          },
        }
      );
    }
  }, [
    dispatch,
    eventVars.selectedSteps,
    eventVars.steps,
    removeSteps,
    savePipeline,
    setConfirm,
  ]);

  const onDetailsDelete = () => {
    let uuid = eventVars.openedStep;
    setConfirm(
      "Warning",
      "A deleted step and its logs cannot be recovered once deleted, are you sure you want to proceed?",
      async (resolve) => {
        removeSteps([uuid]);
        savePipeline(eventVars.steps);
        resolve(true);
        return true;
      }
    );
  };

  const onOpenNotebook = (e: React.MouseEvent) => {
    openNotebook(e, notebookFilePath(pipelineCwd, eventVars.openedStep));
  };

  const centerView = React.useCallback(() => {
    dispatch({
      type: "SET_SCALE_FACTOR",
      payload: DEFAULT_SCALE_FACTOR,
    });

    setState({
      pipelineOffset: INITIAL_PIPELINE_POSITION,
      pipelineStepsHolderOffsetLeft: 0,
      pipelineStepsHolderOffsetTop: 0,
    });
  }, [dispatch, setState]);

  const centerPipelineOrigin = () => {
    let viewportOffset = getOffset(pipelineViewportRef.current);

    let viewportWidth = getWidth(pipelineViewportRef.current);
    let viewportHeight = getHeight(pipelineViewportRef.current);

    let originalX = viewportOffset.left - canvasOffset.left + viewportWidth / 2;
    let originalY = viewportOffset.top - canvasOffset.top + viewportHeight / 2;

    let centerOrigin = [
      scaleCorrected(originalX, eventVars.scaleFactor),
      scaleCorrected(originalY, eventVars.scaleFactor),
    ] as [number, number];

    pipelineSetHolderOrigin(centerOrigin);
  };

  const zoomOut = () => {
    centerPipelineOrigin();
    dispatch({
      type: "SET_SCALE_FACTOR",
      payload: Math.max(eventVars.scaleFactor - 0.25, 0.25),
    });
  };

  const zoomIn = () => {
    centerPipelineOrigin();
    dispatch({
      type: "SET_SCALE_FACTOR",
      payload: Math.min(eventVars.scaleFactor + 0.25, 2),
    });
  };

  const autoLayoutPipeline = () => {
    const spacingFactor = 0.7;
    const gridMargin = 20;

    setPipelineJson((current) => {
      const updated = layoutPipeline(
        // Use the pipeline definition from the editor
        updatePipelineJson(current, eventVars.steps),
        STEP_HEIGHT,
        (1 + spacingFactor * (STEP_HEIGHT / STEP_WIDTH)) *
          (STEP_WIDTH / STEP_HEIGHT),
        1 + spacingFactor,
        gridMargin,
        gridMargin * 4, // don't put steps behind top buttons
        gridMargin,
        STEP_HEIGHT
      );

      // reset eventVars.steps, this will trigger saving
      dispatch({ type: "SET_STEPS", payload: updated.steps });
      return updated;
    }, true); // flush page, re-instantiate all UI elements with new local state for dragging
  };

  const savePositions = React.useCallback(() => {
    const mutations = metadataPositions.current;

    Object.entries(mutations).forEach(([key, position]) => {
      dispatch((state) => ({
        type: "SAVE_STEP_DETAILS",
        payload: {
          stepChanges: {
            meta_data: { position, hidden: state.steps[key].meta_data.hidden },
          },
          uuid: key,
        },
      }));
    });

    metadataPositions.current = {};
  }, [metadataPositions, dispatch]);

  const pipelineSetHolderOrigin = React.useCallback(
    (newOrigin: [number, number]) => {
      let canvasOffset = getOffset(pipelineCanvasRef.current);
      let viewportOffset = getOffset(pipelineViewportRef.current);

      let initialX = canvasOffset.left - viewportOffset.left;
      let initialY = canvasOffset.top - viewportOffset.top;

      let [translateX, translateY] = originTransformScaling(
        [...newOrigin],
        eventVars.scaleFactor
      );

      setState((current) => ({
        pipelineOrigin: newOrigin,
        pipelineStepsHolderOffsetLeft:
          translateX + initialX - current.pipelineOffset[0],
        pipelineStepsHolderOffsetTop:
          translateY + initialY - current.pipelineOffset[1],
      }));
    },
    [eventVars.scaleFactor, setState]
  );

  const onPipelineCanvasWheel = (e: React.WheelEvent) => {
    let pipelineMousePosition = getMousePositionRelativeToPipelineStepHolder();

    // set origin at scroll wheel trigger
    if (
      pipelineMousePosition[0] !== state.pipelineOrigin[0] ||
      pipelineMousePosition[1] !== state.pipelineOrigin[1]
    ) {
      pipelineSetHolderOrigin(pipelineMousePosition);
    }

    /* mouseWheel contains information about the deltaY variable
     * WheelEvent.deltaMode can be:
     * DOM_DELTA_PIXEL = 0x00
     * DOM_DELTA_LINE = 0x01 (only used in Firefox)
     * DOM_DELTA_PAGE = 0x02 (which we'll treat identically to DOM_DELTA_LINE)
     */

    let deltaY =
      e.nativeEvent.deltaMode == 0x01 || e.nativeEvent.deltaMode == 0x02
        ? getScrollLineHeight() * e.nativeEvent.deltaY
        : e.nativeEvent.deltaY;

    dispatch((current) => {
      return {
        type: "SET_SCALE_FACTOR",
        payload: Math.min(
          Math.max(current.scaleFactor - deltaY / 3000, 0.25),
          2
        ),
      };
    });
  };

  const runSelectedSteps = () => {
    runStepUUIDs(eventVars.selectedSteps, "selection");
  };
  const onRunIncoming = () => {
    runStepUUIDs(eventVars.selectedSteps, "incoming");
  };

  const cancelRun = async () => {
    if (isJobRun) {
      setConfirm(
        "Warning",
        "Are you sure that you want to cancel this job run?",
        async (resolve) => {
          setIsCancellingRun(true);
          try {
            await fetcher(`/catch/api-proxy/api/jobs/${jobUuid}/${runUuid}`, {
              method: "DELETE",
            });
            resolve(true);
          } catch (error) {
            setAlert("Error", `Failed to cancel this job run.`);
            resolve(false);
          }
          setIsCancellingRun(false);
          return true;
        }
      );
      return;
    }

    if (!pipelineRunning) {
      setAlert("Error", "There is no pipeline running.");
      return;
    }

    try {
      setIsCancellingRun(true);
      await fetcher(`${PIPELINE_RUN_STATUS_ENDPOINT}/${runUuid}`, {
        method: "DELETE",
      });
      setIsCancellingRun(false);
    } catch (error) {
      setAlert("Error", `Could not cancel pipeline run for runUuid ${runUuid}`);
    }
  };

  const runStepUUIDs = (uuids: string[], type: RunStepsType) => {
    if (!session || session.status !== "RUNNING") {
      setAlert(
        "Error",
        "There is no active session. Please start the session first."
      );
      return;
    }

    if (pipelineRunning) {
      setAlert(
        "Error",
        "The pipeline is currently executing, please wait until it completes."
      );
      return;
    }

    savePipeline(eventVars.steps);
    setPendingRuns({ uuids: [...uuids], type });
  };

  const hasSelectedSteps = eventVars.selectedSteps.length > 1;

  const onSaveDetails = (
    stepChanges: Partial<Step>,
    uuid: string,
    replace: boolean
  ) => {
    dispatch({
      type: "SAVE_STEP_DETAILS",
      payload: {
        stepChanges,
        uuid,
        replace,
      },
    });
    savePipeline(eventVars.steps);
  };

  const getMousePositionRelativeToPipelineStepHolder = () => {
    const { x, y } = mouseTracker.current.client;

    return [
      scaleCorrected(x - canvasOffset.left, eventVars.scaleFactor),
      scaleCorrected(y - canvasOffset.top, eventVars.scaleFactor),
    ] as [number, number];
  };

  React.useEffect(() => {
    // TODO: not enabled when page load, fix this
    enableHotKeys();
    return () => {
      disableHotKeys();
    };
  }, []);

  React.useLayoutEffect(() => {
    const keyDownHandler = (event: KeyboardEvent) => {
      if (activeElementIsInput()) return;

      if (event.key === " " && !keysDown.has("Space")) {
        setPanningState("ready-to-pan");
        keysDown.add("Space");
      }
      if (event.key === "h" && !keysDown.has("h")) {
        centerView();
        keysDown.add("h");
      }
      if (
        !isReadOnly &&
        (event.key === "Backspace" || event.key === "Delete")
      ) {
        if (eventVars.selectedSteps.length > 0) deleteSelectedSteps();
        if (eventVars.selectedConnection)
          removeConnection(eventVars.selectedConnection);
      }
    };
    const keyUpHandler = (event: KeyboardEvent) => {
      if (event.key === " ") {
        setPanningState("idle");
        keysDown.delete("Space");
      }
      if (event.key === "h") {
        keysDown.delete("h");
      }
    };

    document.body.addEventListener("keydown", keyDownHandler);
    document.body.addEventListener("keyup", keyUpHandler);
    return () => {
      document.body.removeEventListener("keydown", keyDownHandler);
      document.body.removeEventListener("keyup", keyUpHandler);
    };
  }, [
    dispatch,
    keysDown,
    isReadOnly,
    eventVars.selectedConnection,
    eventVars.selectedSteps,
    removeConnection,
    deleteSelectedSteps,
    centerView,
  ]);

  const enableHotKeys = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setScope("pipeline-editor");
    setIsHoverEditor(true);
  };

  const disableHotKeys = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setIsHoverEditor(false);
  };

  const onMouseDownViewport = (e: React.MouseEvent) => {
    const isLeftClick = e.button === 0;

    trackMouseMovement(e.clientX, e.clientY);

    if (isLeftClick && panningState === "ready-to-pan") {
      // space held while clicking, means canvas drag
      setPanningState("panning");
    }

    dispatch({ type: "DESELECT_CONNECTION" });

    // not dragging the canvas, so user must be creating a selection rectangle
    // we need to save the offset of cursor against pipeline canvas
    if (isLeftClick && panningState === "idle") {
      dispatch({
        type: "CREATE_SELECTOR",
        payload: getOffset(pipelineCanvasRef.current),
      });
    }
  };

  const onMouseUpViewport = (e: React.MouseEvent) => {
    if (eventVars.stepSelector.active) {
      dispatch({ type: "SET_STEP_SELECTOR_INACTIVE" });
    } else {
      dispatch({ type: "SELECT_STEPS", payload: { uuids: [] } });
    }

    if (eventVars.openedStep) {
      dispatch({ type: "SET_OPENED_STEP", payload: undefined });
    }

    if (newConnection.current) {
      removeConnection(newConnection.current);
    }

    const isLeftClick = e.button === 0;

    if (isLeftClick && panningState === "panning") {
      setPanningState("ready-to-pan");
    }
  };

  const onMouseLeaveViewport = () => {
    if (eventVars.stepSelector.active) {
      dispatch({ type: "SET_STEP_SELECTOR_INACTIVE" });
    }
    if (newConnection.current) {
      removeConnection(newConnection.current);
    }
  };

  const onMouseMoveViewport = (e: React.MouseEvent<HTMLDivElement>) => {
    trackMouseMovement(e.clientX, e.clientY);
    // update newConnection's position
    if (newConnection.current) {
      const { x, y } = getScaleCorrectedPosition({
        offset: canvasOffset,
        position: mouseTracker.current.client,
        scaleFactor: eventVars.scaleFactor,
      });

      newConnection.current = { ...newConnection.current, xEnd: x, yEnd: y };
    }

    if (eventVars.stepSelector.active) {
      dispatch({
        type: "UPDATE_STEP_SELECTOR",
        payload: canvasOffset,
      });
    }

    if (panningState === "ready-to-pan") setPanningState("panning");

    if (panningState === "panning") {
      let dx = mouseTracker.current.delta.x;
      let dy = mouseTracker.current.delta.y;

      setState((current) => ({
        pipelineOffset: [
          current.pipelineOffset[0] + dx,
          current.pipelineOffset[1] + dy,
        ],
      }));
    }
  };

  const services = React.useMemo(() => {
    // not a job run, so it is an interactive run, services are only available if session is RUNNING
    if (!isJobRun && session?.status !== "RUNNING") return null;
    // it is a job run (non-interactive run), we are unable to check its actual session
    // but we can check its job run status,
    if (isJobRun && pipelineJson && !pipelineRunning) return null;
    const allServices = isJobRun
      ? pipelineJson?.services || {}
      : session && session.user_services
      ? session.user_services
      : {};
    // Filter services based on scope

    return filterServices(
      allServices,
      jobUuid ? "noninteractive" : "interactive"
    );
  }, [pipelineJson, session, jobUuid, isJobRun, pipelineRunning]);

  // Check if there is an incoming step (that is not part of the
  // selection).
  // This is checked to conditionally render the
  // 'Run incoming steps' button.
  let selectedStepsHasIncoming = false;
  for (let x = 0; x < eventVars.selectedSteps.length; x++) {
    let selectedStep = eventVars.steps[eventVars.selectedSteps[x]];
    for (let i = 0; i < selectedStep.incoming_connections.length; i++) {
      let incomingStepUUID = selectedStep.incoming_connections[i];
      if (!eventVars.selectedSteps.includes(incomingStepUUID)) {
        selectedStepsHasIncoming = true;
        break;
      }
    }
    if (selectedStepsHasIncoming) {
      break;
    }
  }

  React.useEffect(() => {
    if (
      state.pipelineOffset[0] === INITIAL_PIPELINE_POSITION[0] &&
      state.pipelineOffset[1] === INITIAL_PIPELINE_POSITION[1] &&
      eventVars.scaleFactor === DEFAULT_SCALE_FACTOR
    ) {
      pipelineSetHolderOrigin([0, 0]);
    }
  }, [eventVars.scaleFactor, state.pipelineOffset, pipelineSetHolderOrigin]);

  const servicesButtonRef = React.useRef<HTMLButtonElement>();
  const flushPage = useHasChanged(hash.current);

  const [canvasResizeStyle, resizeCanvas] = React.useState<React.CSSProperties>(
    {}
  );

  return (
    <div className="pipeline-view">
      <div
        className="pane pipeline-view-pane"
        onMouseOver={enableHotKeys}
        onMouseLeave={disableHotKeys}
      >
        {jobUuid && isReadOnly && (
          <div className="pipeline-actions top-left">
            <BackToJobButton onClick={returnToJob} />
          </div>
        )}
        <div className="pipeline-actions bottom-left">
          <div className="navigation-buttons">
            <IconButton
              title="Center"
              data-test-id="pipeline-center"
              onClick={centerView}
            >
              <CropFreeIcon />
            </IconButton>
            <IconButton title="Zoom out" onClick={zoomOut}>
              <RemoveIcon />
            </IconButton>
            <IconButton title="Zoom in" onClick={zoomIn}>
              <AddIcon />
            </IconButton>
            {!isReadOnly && (
              <IconButton title="Auto layout" onClick={autoLayoutPipeline}>
                <AccountTreeOutlinedIcon />
              </IconButton>
            )}
          </div>
          {!isReadOnly &&
            !pipelineRunning &&
            eventVars.selectedSteps.length > 0 &&
            !eventVars.stepSelector.active && (
              <div className="selection-buttons">
                <Button
                  variant="contained"
                  onClick={runSelectedSteps}
                  data-test-id="interactive-run-run-selected-steps"
                >
                  Run selected steps
                </Button>
                {selectedStepsHasIncoming && (
                  <Button
                    variant="contained"
                    onClick={onRunIncoming}
                    data-test-id="interactive-run-run-incoming-steps"
                  >
                    Run incoming steps
                  </Button>
                )}
              </div>
            )}
          {pipelineRunning && (
            <div className="selection-buttons">
              <Button
                variant="contained"
                color="secondary"
                onClick={cancelRun}
                startIcon={<CloseIcon />}
                disabled={isCancellingRun}
                data-test-id="interactive-run-cancel"
              >
                Cancel run
              </Button>
            </div>
          )}
        </div>
        {pipelineJson && (
          <div className={"pipeline-actions top-right"}>
            {!isReadOnly && (
              <Button
                variant="contained"
                color="secondary"
                onClick={createNextStep}
                startIcon={<AddIcon />}
                data-test-id="step-create"
              >
                NEW STEP
              </Button>
            )}
            {isReadOnly && (
              <Button color="secondary" startIcon={<VisibilityIcon />} disabled>
                Read only
              </Button>
            )}

            <Button
              variant="contained"
              color="secondary"
              onClick={openLogs}
              onAuxClick={openLogs}
              startIcon={<ViewHeadlineIcon />}
            >
              Logs
            </Button>

            <Button
              id="running-services-button"
              variant="contained"
              color="secondary"
              onClick={showServices}
              startIcon={<SettingsIcon />}
              ref={servicesButtonRef}
            >
              Services
            </Button>
            <ServicesMenu
              isOpen={isShowingServices}
              onClose={hideServices}
              anchor={servicesButtonRef}
              services={services}
            />

            <Button
              variant="contained"
              color="secondary"
              onClick={openSettings}
              startIcon={<TuneIcon />}
              data-test-id="pipeline-settings"
            >
              Settings
            </Button>
          </div>
        )}
        <PipelineViewport
          ref={pipelineViewportRef}
          onMouseMove={onMouseMoveViewport}
          onMouseDown={onMouseDownViewport}
          onMouseUp={onMouseUpViewport}
          onMouseLeave={onMouseLeaveViewport}
          onWheel={onPipelineCanvasWheel}
          resizeCanvas={resizeCanvas}
          className={panningState}
        >
          <PipelineCanvas
            ref={pipelineCanvasRef}
            style={{
              transformOrigin: `${state.pipelineOrigin[0]}px ${state.pipelineOrigin[1]}px`,
              transform:
                `translateX(${state.pipelineOffset[0]}px) ` +
                `translateY(${state.pipelineOffset[1]}px) ` +
                `scale(${eventVars.scaleFactor})`,
              left: state.pipelineStepsHolderOffsetLeft,
              top: state.pipelineStepsHolderOffsetTop,
              ...canvasResizeStyle,
            }}
          >
            {eventVars.connections.map((connection) => {
              if (!connection) return null;

              const { startNodeUUID, endNodeUUID } = connection;
              const startNode =
                stepDomRefs.current[`${startNodeUUID}-outgoing`];
              const endNode = endNodeUUID
                ? stepDomRefs.current[`${endNodeUUID}-incoming`]
                : null;

              // startNode is required
              if (!startNode) return null;

              // user is trying to make a new connection
              const isNew = !endNodeUUID || hasValue(newConnection.current);

              // if the connection is attached to a selected step,
              // the connection should update its start/end node, to move along with the step

              const shouldUpdateX =
                flushPage ||
                eventVars.cursorControlledStep === startNodeUUID ||
                eventVars.selectedSteps.includes(startNodeUUID);

              const shouldUpdateY =
                flushPage ||
                eventVars.cursorControlledStep === endNodeUUID ||
                isNew ||
                eventVars.selectedSteps.includes(endNodeUUID);

              const shouldUpdate = [shouldUpdateX, shouldUpdateY] as [
                boolean,
                boolean
              ];

              let startNodePosition = getPosition(startNode);
              let endNodePosition =
                getPosition(endNode) ||
                (newConnection.current
                  ? {
                      x: newConnection.current.xEnd,
                      y: newConnection.current.yEnd,
                    }
                  : null);

              const isSelected =
                !hasSelectedSteps &&
                eventVars.selectedConnection?.startNodeUUID === startNodeUUID &&
                eventVars.selectedConnection?.endNodeUUID === endNodeUUID;

              const key = `${connection.startNodeUUID}-${connection.endNodeUUID}-${hash.current}`;

              const movedToTop = eventVars.selectedSteps.some((step) =>
                key.includes(step)
              );

              return (
                <PipelineConnection
                  key={key}
                  shouldRedraw={flushPage}
                  isNew={isNew}
                  selected={isSelected}
                  movedToTop={movedToTop}
                  startNodeUUID={startNodeUUID}
                  endNodeUUID={endNodeUUID}
                  zIndexMax={zIndexMax}
                  getPosition={getPosition}
                  eventVarsDispatch={dispatch}
                  stepDomRefs={stepDomRefs}
                  startNodeX={startNodePosition.x}
                  startNodeY={startNodePosition.y}
                  endNodeX={endNodePosition?.x}
                  endNodeY={endNodePosition?.y}
                  newConnection={newConnection}
                  shouldUpdate={shouldUpdate}
                  cursorControlledStep={eventVars.cursorControlledStep}
                />
              );
            })}
            {Object.entries(eventVars.steps).map((entry) => {
              const [uuid, step] = entry;
              const selected = eventVars.selectedSteps.includes(uuid);

              const isIncomingActive =
                eventVars.selectedConnection &&
                eventVars.selectedConnection.endNodeUUID === step.uuid;

              const isOutgoingActive =
                eventVars.selectedConnection &&
                eventVars.selectedConnection.startNodeUUID === step.uuid;

              const movedToTop =
                eventVars.selectedConnection?.startNodeUUID === step.uuid ||
                eventVars.selectedConnection?.endNodeUUID === step.uuid;

              const executionState = stepExecutionState
                ? stepExecutionState[step.uuid] || { status: "IDLE" }
                : { status: "IDLE" };

              const stateText = getStateText(executionState);

              // only add steps to the component that have been properly
              // initialized
              return (
                <PipelineStep
                  key={`${step.uuid}-${hash.current}`}
                  data={step}
                  disabledDragging={isReadOnly || panningState === "panning"}
                  scaleFactor={eventVars.scaleFactor}
                  offset={canvasOffset}
                  selected={selected}
                  zIndexMax={zIndexMax}
                  isSelectorActive={eventVars.stepSelector.active}
                  cursorControlledStep={eventVars.cursorControlledStep}
                  savePositions={savePositions}
                  movedToTop={movedToTop}
                  ref={(el) => (stepDomRefs.current[step.uuid] = el)}
                  isStartNodeOfNewConnection={
                    newConnection.current?.startNodeUUID === step.uuid
                  }
                  eventVarsDispatch={dispatch}
                  selectedSteps={eventVars.selectedSteps}
                  mouseTracker={mouseTracker}
                  onDoubleClick={onDoubleClickStep}
                >
                  <ConnectionDot
                    incoming
                    ref={(el) =>
                      (stepDomRefs.current[`${step.uuid}-incoming`] = el)
                    }
                    active={isIncomingActive}
                    endCreateConnection={() => {
                      if (newConnection.current) {
                        onMouseUpPipelineStep(step.uuid);
                      }
                    }}
                  />
                  <Box className={"execution-indicator"}>
                    <StepStatus value={executionState.status} />
                    {stateText}
                  </Box>
                  <div className="step-label-holder">
                    <div className={"step-label"}>
                      {step.title}
                      <span className="filename">{step.file_path}</span>
                      <span className="filename">{`${step.uuid}`}</span>
                    </div>
                  </div>
                  <ConnectionDot
                    outgoing
                    ref={(el) =>
                      (stepDomRefs.current[`${step.uuid}-outgoing`] = el)
                    }
                    active={isOutgoingActive}
                    startCreateConnection={() => {
                      if (!isReadOnly && !newConnection.current) {
                        newConnection.current = {
                          startNodeUUID: step.uuid,
                        };
                        instantiateConnection(step.uuid);
                      }
                    }}
                  />
                </PipelineStep>
              );
            })}
            {eventVars.stepSelector.active && (
              <Rectangle
                {...getStepSelectorRectangle(eventVars.stepSelector)}
              />
            )}
          </PipelineCanvas>
        </PipelineViewport>
      </div>

      <StepDetails
        key={eventVars.openedStep}
        onSave={onSaveDetails}
        onDelete={onDetailsDelete}
        onOpenFilePreviewView={onOpenFilePreviewView}
        onOpenNotebook={onOpenNotebook}
      />

      {hasSelectedSteps && !isReadOnly && (
        <div className={"pipeline-actions bottom-right"}>
          <Button
            variant="contained"
            color="secondary"
            onClick={deleteSelectedSteps}
            startIcon={<DeleteIcon />}
            disabled={isDeletingSteps}
            data-test-id="step-delete-multi"
          >
            Delete
          </Button>
        </div>
      )}
    </div>
  );
};
