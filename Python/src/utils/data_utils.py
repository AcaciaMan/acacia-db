"""
Example utility functions for data handling.

This module provides common utility functions for data processing,
file operations, and path management.
"""

import os
from pathlib import Path
from typing import Union, List, Dict, Any
import json
import yaml


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent.parent


def get_data_path(subfolder: str = "", filename: str = "") -> Path:
    """
    Get path to data directory or specific file.
    
    Args:
        subfolder: Subfolder within data directory (raw, processed, etc.)
        filename: Specific filename
        
    Returns:
        Path object to data directory or file
    """
    data_dir = get_project_root() / "data"
    
    if subfolder:
        data_dir = data_dir / subfolder
    
    if filename:
        data_dir = data_dir / filename
        
    return data_dir


def get_sample_path(subfolder: str = "", filename: str = "") -> Path:
    """
    Get path to samples directory or specific file.
    
    Args:
        subfolder: Subfolder within samples directory (input, expected)
        filename: Specific filename
        
    Returns:
        Path object to samples directory or file
    """
    samples_dir = get_project_root() / "samples"
    
    if subfolder:
        samples_dir = samples_dir / subfolder
    
    if filename:
        samples_dir = samples_dir / filename
        
    return samples_dir


def ensure_dir_exists(path: Union[str, Path]) -> None:
    """Create directory if it doesn't exist."""
    Path(path).mkdir(parents=True, exist_ok=True)


def load_config(config_name: str) -> Dict[str, Any]:
    """
    Load configuration file from config directory.
    
    Args:
        config_name: Name of config file (with or without extension)
        
    Returns:
        Dictionary containing configuration
    """
    config_path = get_project_root() / "config"
    
    # Try different extensions
    for ext in ['.yaml', '.yml', '.json']:
        config_file = config_path / f"{config_name}{ext}"
        if config_file.exists():
            with open(config_file, 'r') as f:
                if ext in ['.yaml', '.yml']:
                    return yaml.safe_load(f)
                else:
                    return json.load(f)
    
    raise FileNotFoundError(f"Config file '{config_name}' not found")


def list_data_files(subfolder: str = "", extension: str = "") -> List[Path]:
    """
    List files in data directory.
    
    Args:
        subfolder: Subfolder to search in
        extension: File extension to filter by (e.g., '.csv')
        
    Returns:
        List of Path objects
    """
    data_dir = get_data_path(subfolder)
    
    if not data_dir.exists():
        return []
    
    if extension:
        pattern = f"*{extension}"
    else:
        pattern = "*"
    
    return list(data_dir.glob(pattern))
