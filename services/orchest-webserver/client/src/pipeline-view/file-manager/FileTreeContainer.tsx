import Box from "@mui/material/Box";
import React from "react";
import { useFileManagerLocalContext } from "../contexts/FileManagerLocalContext";
import { useFileManagerState } from "../hooks/useFileManagerState";

export const FileTreeContainer: React.FC = ({ children }) => {
  const setSelectedFiles = useFileManagerState((state) => state.setSelected);
  const { handleContextMenu } = useFileManagerLocalContext();

  return (
    <Box
      sx={{
        userSelect: "none",
        maxHeight: "100%",
        overflowY: "auto",
        flex: 1,
        padding: (theme) => theme.spacing(0, 1, 2),
      }}
      onContextMenu={(event) => handleContextMenu(event, "")}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        // click away should clean up selected items
        if (event.detail === 1 && !(event.metaKey || event.ctrlKey)) {
          setSelectedFiles([]);
        }
      }}
    >
      {children}
    </Box>
  );
};
