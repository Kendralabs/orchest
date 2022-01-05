import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  collapseDoubleDots,
  extensionFromFilename,
  kernelNameToLanguage,
  makeCancelable,
  makeRequest,
  PromiseManager,
  RefManager,
} from "@orchest/lib-utils";
import "codemirror/mode/javascript/javascript";
import cloneDeep from "lodash.clonedeep";
import React from "react";
import { Controlled as CodeMirror } from "react-codemirror2";
import ProjectFilePicker from "../components/ProjectFilePicker";

const ConnectionItem = ({
  connection: { name, uuid },
}: {
  connection: { name: [string, string]; uuid: string };
}) => {
  const [title, filePath] = name;

  return (
    <div className="connection-item" data-uuid={uuid}>
      <i className="material-icons">drag_indicator</i> <span>{title}</span>{" "}
      <span className="filename">({filePath})</span>
    </div>
  );
};

const KERNEL_OPTIONS = [
  { value: "python", label: "Python" },
  { value: "r", label: "R" },
  { value: "julia", label: "Julia" },
];

const PipelineDetailsProperties: React.FC<{
  [key: string]: any;
  menuMaxWidth?: string;
}> = (props) => {
  const { $ } = window;

  const [state, setState] = React.useState({
    environmentOptions: [],
    // this is required to let users edit JSON (while typing the text will not be valid JSON)
    editableParameters: JSON.stringify(props.step.parameters, null, 2),
    autogenerateFilePath: props.step.file_path.length == 0,
  });

  const [promiseManager] = React.useState(new PromiseManager());
  const [refManager] = React.useState(new RefManager());

  const isNotebookStep =
    extensionFromFilename(props.step.file_path) === "ipynb";

  const fetchEnvironmentOptions = () => {
    let environmentsEndpoint = `/store/environments/${props.project_uuid}`;

    if (isNotebookStep) {
      environmentsEndpoint +=
        "?language=" + kernelNameToLanguage(props.step.kernel.name);
    }

    let fetchEnvironmentOptionsPromise = makeCancelable(
      makeRequest("GET", environmentsEndpoint),
      promiseManager
    );

    fetchEnvironmentOptionsPromise.promise
      .then((response) => {
        let result = JSON.parse(response);

        let environmentOptions = [];

        let currentEnvironmentInEnvironments = false;

        for (let environment of result) {
          if (environment.uuid == props.step.environment) {
            currentEnvironmentInEnvironments = true;
          }
          environmentOptions.push({
            value: environment.uuid,
            label: environment.name,
          });
        }

        if (!currentEnvironmentInEnvironments) {
          // update environment
          onChangeEnvironment(
            environmentOptions.length > 0 ? environmentOptions[0].value : "",
            environmentOptions.length > 0 ? environmentOptions[0].label : ""
          );
        }

        setState((prevState) => ({
          ...prevState,
          environmentOptions: environmentOptions,
        }));
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const onChangeFileName = (updatedFileName: string) => {
    if (updatedFileName.length > 0) {
      setState((prevState) => ({
        ...prevState,
        autogenerateFilePath: false,
      }));
    }

    props.onSave({ file_path: updatedFileName }, props.step.uuid);
  };

  const onChangeParameterJSON = (updatedParameterJSON) => {
    setState((prevState) => ({
      ...prevState,
      editableParameters: updatedParameterJSON,
    }));

    try {
      props.onSave(
        { parameters: JSON.parse(updatedParameterJSON) },
        props.step.uuid,
        true
      );
    } catch (err) {}
  };

  const onChangeEnvironment = (
    updatedEnvironmentUUID: string,
    updatedEnvironmentName: string
  ) => {
    props.onSave(
      {
        environment: updatedEnvironmentUUID,
        kernel: { display_name: updatedEnvironmentName },
      },
      props.step.uuid
    );
    if (updatedEnvironmentUUID !== "" && props.step["file_path"] !== "") {
      let kernelName = `orchest-kernel-${updatedEnvironmentUUID}`;

      window.orchest.jupyter.setNotebookKernel(
        collapseDoubleDots(props.pipelineCwd + props.step["file_path"]).slice(
          1
        ),
        kernelName
      );
    }
  };

  const onChangeKernel = (updatedKernel: string) => {
    props.onSave(
      {
        kernel: { name: updatedKernel },
      },
      props.step.uuid
    );
  };

  const titleToFileName = (title) => {
    const alphanumeric = /[^a-zA-Z0-9-]/g;
    title = title.replace(alphanumeric, "-");
    const concatDashes = /(-+)/g;
    title = title.replace(concatDashes, "-");
    if (title.slice(-1) == "-") {
      title = title.slice(0, -1);
    }
    title = title.toLowerCase();
    return title;
  };

  const onChangeTitle = (updatedTitle) => {
    props.onSave(
      {
        title: updatedTitle,
      },
      props.step.uuid
    );
  };

  const swapConnectionOrder = (oldConnectionIndex, newConnectionIndex) => {
    // check if there is work to do
    if (oldConnectionIndex != newConnectionIndex) {
      // note it's creating a reference
      let connectionList = cloneDeep(props.step.incoming_connections);

      let tmp = connectionList[oldConnectionIndex];
      connectionList.splice(oldConnectionIndex, 1);
      connectionList.splice(newConnectionIndex, 0, tmp);

      props.onSave({ incoming_connections: connectionList }, props.step.uuid);
    }
  };

  const setupConnectionListener = () => {
    // initiate draggable connections

    let previousPosition = 0;
    let connectionItemOffset = 0;
    let oldConnectionIndex = 0;
    let newConnectionIndex = 0;

    let numConnectionListItems = $(refManager.refs.connectionList).find(
      ".connection-item"
    ).length;

    $(refManager.refs.connectionList).on(
      "mousedown",
      ".connection-item",
      function (e) {
        previousPosition = e.clientY;
        connectionItemOffset = 0;

        $(refManager.refs.connectionList).addClass("dragging");

        oldConnectionIndex = $(this).index();

        $(this).addClass("selected");
      }
    );

    $(document).on("mousemove.connectionList", function (e) {
      let selectedConnection = $(refManager.refs.connectionList).find(
        ".connection-item.selected"
      );

      if (selectedConnection.length > 0) {
        let positionDelta = e.clientY - previousPosition;
        let itemHeight = selectedConnection.outerHeight();

        connectionItemOffset += positionDelta;

        // limit connectionItemOffset
        if (connectionItemOffset < -itemHeight * oldConnectionIndex) {
          connectionItemOffset = -itemHeight * oldConnectionIndex;
        } else if (
          connectionItemOffset >
          itemHeight * (numConnectionListItems - oldConnectionIndex - 1)
        ) {
          connectionItemOffset =
            itemHeight * (numConnectionListItems - oldConnectionIndex - 1);
        }

        selectedConnection.css({
          transform: "translateY(" + connectionItemOffset + "px)",
        });

        previousPosition = e.clientY;

        // find new index based on current position
        let elementYPosition =
          (oldConnectionIndex * itemHeight + connectionItemOffset) / itemHeight;

        newConnectionIndex = Math.min(
          Math.max(0, Math.round(elementYPosition)),
          numConnectionListItems - 1
        );

        // evaluate swap classes for all elements in list besides selectedConnection
        for (let i = 0; i < numConnectionListItems; i++) {
          if (i != oldConnectionIndex) {
            let connectionListItem = $(refManager.refs.connectionList)
              .find(".connection-item")
              .eq(i);

            connectionListItem.removeClass("swapped-up");
            connectionListItem.removeClass("swapped-down");

            if (newConnectionIndex >= i && i > oldConnectionIndex) {
              connectionListItem.addClass("swapped-up");
            } else if (newConnectionIndex <= i && i < oldConnectionIndex) {
              connectionListItem.addClass("swapped-down");
            }
          }
        }
      }
    });

    // Note, listener should be unmounted
    $(document).on("mouseup.connectionList", function (e) {
      let selectedConnection = $(refManager.refs.connectionList).find(
        ".connection-item.selected"
      );

      if (selectedConnection.length > 0) {
        selectedConnection.css({ transform: "" });
        selectedConnection.removeClass("selected");

        $(refManager.refs.connectionList)
          .find(".connection-item")
          .removeClass("swapped-up")
          .removeClass("swapped-down");

        $(refManager.refs.connectionList).removeClass("dragging");

        swapConnectionOrder(oldConnectionIndex, newConnectionIndex);
      }
    });
  };

  const clearConnectionListener = () => {
    $(document).off("mouseup.connectionList");
    $(document).off("mousemove.connectionList");
  };

  React.useEffect(() => {
    if (!props.readOnly) {
      // set focus on first field
      refManager.refs.titleTextField.focus();
    }

    fetchEnvironmentOptions();

    return () => {
      promiseManager.cancelCancelablePromises();
      clearConnectionListener();
    };
  }, []);

  React.useEffect(() => {
    if (state.autogenerateFilePath) {
      // Make sure the props have been updated
      onChangeFileName(titleToFileName(props.step.title), true);
    }
  }, [props?.step?.title]);

  React.useEffect(() => {
    clearConnectionListener();
    setupConnectionListener();
  }, [props.step]);

  React.useEffect(() => fetchEnvironmentOptions(), [
    props?.step?.file_path,
    props?.step?.kernel?.name,
  ]);

  return (
    <div className={"detail-subview"}>
      <Stack direction="column" spacing={3}>
        <TextField
          autoFocus
          value={props.step.title}
          onChange={(e) => onChangeTitle(e.target.value)}
          label="Title"
          disabled={props.readOnly}
          fullWidth
          ref={refManager.nrefs.titleTextField}
          data-test-id="step-title-textfield"
        />
        {props.readOnly ? (
          <TextField
            value={props.step.file_path}
            label="File name"
            disabled={props.readOnly}
            fullWidth
            margin="normal"
            data-test-id="step-file-name-textfield"
          />
        ) : (
          <ProjectFilePicker
            value={props.step.file_path}
            project_uuid={props.project_uuid}
            pipeline_uuid={props.pipeline_uuid}
            step_uuid={props.step.uuid}
            onChange={onChangeFileName}
            menuMaxWidth={props.menuMaxWidth}
          />
        )}
        {!isNotebookStep && (
          <FormControl fullWidth>
            <InputLabel id="kernel-language-label">Kernel language</InputLabel>
            <Select
              label="Kernel language"
              labelId="kernel-language-label"
              id="kernel-language"
              value={props.step.kernel.name}
              disabled={props.readOnly}
              onChange={(e) => onChangeKernel(e.target.value)}
            >
              {KERNEL_OPTIONS.map((option) => {
                return (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        )}
        <FormControl fullWidth>
          <InputLabel id="environment-label">Environment</InputLabel>
          <Select
            label="Kernel language"
            labelId="environment-label"
            id="environment"
            value={props.step.environment}
            disabled={props.readOnly}
            onChange={(e) => {
              const selected = state.environmentOptions.find(
                (option) => option.value === e.target.value
              );
              onChangeEnvironment(selected.value, selected.label);
            }}
          >
            {state.environmentOptions.map((option) => {
              return (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>

        <Box>
          <Typography
            component="h3"
            variant="subtitle2"
            sx={{ marginBottom: (theme) => theme.spacing(1) }}
          >
            Parameters
          </Typography>
          <CodeMirror
            value={state.editableParameters}
            options={{
              mode: "application/json",
              theme: "jupyter",
              lineNumbers: true,
              readOnly: props.readOnly === true, // not sure whether CodeMirror accepts 'falsy' values
            }}
            onBeforeChange={(editor, data, value) => {
              onChangeParameterJSON(value);
            }}
          />
          {(() => {
            try {
              JSON.parse(state.editableParameters);
            } catch {
              return (
                <Alert severity="warning">Your input is not valid JSON.</Alert>
              );
            }
          })()}
        </Box>

        {props.step.incoming_connections.length != 0 && (
          <Box>
            <Typography
              component="h3"
              variant="subtitle2"
              sx={{ marginBottom: (theme) => theme.spacing(1) }}
            >
              Connections
            </Typography>

            <div
              className="connection-list"
              ref={refManager.nrefs.connectionList}
            >
              {props.step.incoming_connections.map((item: string) => (
                <ConnectionItem
                  connection={{
                    name: props.connections[item],
                    uuid: item,
                  }}
                  key={item}
                />
              ))}
            </div>
          </Box>
        )}
      </Stack>
    </div>
  );
};

export default PipelineDetailsProperties;
