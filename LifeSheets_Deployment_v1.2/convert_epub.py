import pypandoc
import os

def convert_to_epub():
    # Make sure pandoc is installed
    try:
        pypandoc.get_pandoc_version()
    except OSError:
        print("Pandoc not found. Downloading...")
        pypandoc.download_pandoc()
        
    input_file = r"c:\Users\timot\.gemini\antigravity\scratch\options-grader\LifeSheets_Deployment_v1.2\Beastmode_Manuscript.md"
    output_file = r"c:\Users\timot\Downloads\LifeSheets_v1.2_The_Beastmode_Protocol.epub"
    
    print(f"Converting {input_file} to EPUB...")
    
    pypandoc.convert_file(
        input_file, 
        'epub', 
        outputfile=output_file,
        extra_args=[
            '--title', 'LifeSheets v1.2: The Beastmode Protocol',
            '--epub-cover-image', r'C:\Users\timot\Downloads\LifeSheets_Cover.png'
        ]
    )
    
    print(f"Successfully created {output_file}")

if __name__ == "__main__":
    convert_to_epub()
