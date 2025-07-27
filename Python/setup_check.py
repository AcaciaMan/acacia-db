"""
Setup script for Oracle DB tables/views processor.
def check_config_files():
    "Check if required configuration files exist."
    # Get the directory where this script is located
    script_dir = Path(__file__).parent
    
    config_file = script_dir / "config" / "oracle_db_example_to_solr.json"
    if config_file.exists():
        print("✓ Configuration file found")
        return True
    else:
        print(f"✗ Configuration file not found: {config_file}")
        return Falsept helps install dependencies and check system requirements.
"""

import subprocess
import sys
from pathlib import Path

def check_ripgrep():
    """Check if ripgrep is installed."""
    try:
        result = subprocess.run(['rg', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            print("✓ ripgrep is installed")
            print(f"  Version: {result.stdout.strip().split()[1]}")
            return True
        else:
            print("✗ ripgrep is not working properly")
            return False
    except FileNotFoundError:
        print("✗ ripgrep (rg) is not installed")
        return False

def install_ripgrep_instructions():
    """Provide installation instructions for ripgrep."""
    print("\nTo install ripgrep:")
    print("=" * 30)
    
    if sys.platform.startswith('win'):
        print("Windows:")
        print("  Option 1: winget install BurntSushi.ripgrep.MSVC")
        print("  Option 2: choco install ripgrep")
        print("  Option 3: Download from https://github.com/BurntSushi/ripgrep/releases")
        
    elif sys.platform.startswith('linux'):
        print("Linux:")
        print("  Ubuntu/Debian: sudo apt-get install ripgrep")
        print("  CentOS/RHEL: sudo yum install ripgrep")
        print("  Fedora: sudo dnf install ripgrep")
        
    elif sys.platform.startswith('darwin'):
        print("macOS:")
        print("  Homebrew: brew install ripgrep")
        print("  MacPorts: sudo port install ripgrep")

def check_python_version():
    """Check Python version compatibility."""
    version = sys.version_info
    if version >= (3, 7):
        print(f"✓ Python {version.major}.{version.minor}.{version.micro} is compatible")
        return True
    else:
        print(f"✗ Python {version.major}.{version.minor}.{version.micro} is too old (need 3.7+)")
        return False

def check_config_files():
    """Check if required configuration files exist."""
    project_root = Path(__file__).parent
    
    config_file = project_root / "config" / "oracle_db_example_to_solr.json"
    if config_file.exists():
        print("✓ Configuration file found")
        return True
    else:
        print(f"✗ Configuration file not found: {config_file}")
        return False

def main():
    """Main setup check function."""
    print("Oracle DB Tables/Views Processor Setup Check")
    print("=" * 50)
    
    all_good = True
    
    # Check Python version
    if not check_python_version():
        all_good = False
    
    # Check ripgrep
    if not check_ripgrep():
        all_good = False
        install_ripgrep_instructions()
    
    # Check config files
    if not check_config_files():
        all_good = False
    
    print("\n" + "=" * 50)
    if all_good:
        print("✓ All requirements met! You can run the processor.")
        print("\nTo run the script:")
        print("  python src/scripts/tables_views_to_solr.py")
    else:
        print("✗ Some requirements are missing. Please address the issues above.")
    
    return all_good

if __name__ == "__main__":
    main()
